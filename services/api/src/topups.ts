import { paymentConfig } from "./integrations.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { transaction, audit } from "./db.js";
import { grant } from "./credits.js";
import { mp, billingReady, ProviderError } from "./billing.js";
import { HttpError } from "./errors.js";
export async function topupCheckout(
  pool: Pool,
  c: Config,
  userId: string,
  packageId: string,
) {
  c = await paymentConfig(pool, c);
  if (!billingReady(c))
    throw new HttpError(503, "Pagamento ainda não habilitado");
  const intent = await transaction(pool, async (db) => {
    const user = (
      await db.query("SELECT email FROM users WHERE id=$1 FOR UPDATE", [userId])
    ).rows[0];
    const pending = (
      await db.query(
        "SELECT checkout_url FROM credit_orders WHERE user_id=$1 AND package_id=$2 AND status IN ('creating','pending') ORDER BY created_at DESC LIMIT 1",
        [userId, packageId],
      )
    ).rows[0];
    if (pending) {
      if (pending.checkout_url) return { url: pending.checkout_url };
      throw new HttpError(
        409,
        "Recarga em processamento. Consulte o painel antes de tentar novamente.",
      );
    }
    const pack = (
      await db.query(
        "SELECT * FROM credit_packages WHERE id=$1 AND active=true",
        [packageId],
      )
    ).rows[0];
    if (!pack) throw new HttpError(404, "Pacote indisponível");
    const id = randomUUID();
    await db.query(
      "INSERT INTO credit_orders(id,user_id,package_id,credits,amount_cents) VALUES($1,$2,$3,$4,$5)",
      [id, userId, packageId, pack.credits, pack.price_cents],
    );
    return { id, pack, email: user.email };
  });
  if (intent.url) return { url: intent.url };
  try {
    const result = await mp(
      c,
      "/checkout/preferences",
      "POST",
      {
        items: [
          {
            id: intent.pack.id,
            title:
              "GameForge " +
              intent.pack.name +
              " — " +
              intent.pack.credits +
              " créditos",
            quantity: 1,
            currency_id: "BRL",
            unit_price: intent.pack.price_cents / 100,
          },
        ],
        external_reference: intent.id,
        payer: { email: intent.email },
        back_urls: {
          success: c.appUrl + "/app/creditos",
          pending: c.appUrl + "/app/creditos",
          failure: c.appUrl + "/app/creditos",
        },
        auto_return: "approved",
        notification_url: c.appUrl + "/api/webhooks/mercadopago",
        payment_methods: { installments: 1 },
      },
      intent.id,
    );
    const url = String(result.init_point || "");
    if (
      !/^https:\/\/([a-z0-9-]+\.)*mercadopago\.(com|com\.br|com\.ar)\//i.test(
        url,
      )
    )
      throw new HttpError(502, "Checkout não confirmado");
    await pool.query(
      "UPDATE credit_orders SET status='pending',provider_id=$2,checkout_url=$3 WHERE id=$1",
      [intent.id, result.id, url],
    );
    await audit(pool, userId, "credits.checkout", { id: intent.id });
    return { url };
  } catch (error) {
    if (
      error instanceof ProviderError &&
      error.upstreamStatus >= 400 &&
      error.upstreamStatus < 500 &&
      error.upstreamStatus !== 429
    )
      await pool.query("UPDATE credit_orders SET status='failed' WHERE id=$1", [
        intent.id,
      ]);
    throw new HttpError(
      502,
      "Não foi possível confirmar a recarga. Consulte o painel; uma criação inconclusiva requer conferência antes de outra tentativa.",
    );
  }
}
export async function reconcileTopup(pool: Pool, c: Config, paymentId: string) {
  c = await paymentConfig(pool, c);
  const payment = await mp(c, "/v1/payments/" + encodeURIComponent(paymentId));
  const ref = String(payment.external_reference || "");
  if (!/^[a-f0-9-]{36}$/i.test(ref)) return false;
  const order = (
    await pool.query("SELECT * FROM credit_orders WHERE id=$1", [ref])
  ).rows[0];
  if (!order) return false;
  if (
    String(payment.collector_id) !== c.mpCollectorId ||
    payment.live_mode !== c.mpLiveMode ||
    payment.currency_id !== "BRL" ||
    Math.round(Number(payment.transaction_amount) * 100) !== order.amount_cents
  )
    throw new HttpError(409, "Recarga não corresponde à compra");
  const merchant = await mp(
    c,
    "/merchant_orders/" +
      encodeURIComponent(String((payment.order as { id?: unknown })?.id || "")),
  );
  if (
    !merchant.preference_id ||
    (order.provider_id && merchant.preference_id !== order.provider_id) ||
    merchant.external_reference !== order.id ||
    !Array.isArray(merchant.payments) ||
    !merchant.payments.some((p: { id: unknown }) => String(p.id) === paymentId)
  )
    throw new HttpError(409, "Pedido de pagamento inconsistente");
  const approved =
    payment.status === "approved" &&
    payment.status_detail === "accredited" &&
    Number(payment.transaction_amount_refunded || 0) === 0;
  await transaction(pool, async (db) => {
    const current = (
      await db.query("SELECT * FROM credit_orders WHERE id=$1 FOR UPDATE", [
        order.id,
      ])
    ).rows[0];
    if (current.provider_id && current.provider_id !== merchant.preference_id)
      throw new HttpError(409, "Preferência divergente");
    if (current.payment_id && current.payment_id !== paymentId)
      throw new HttpError(
        409,
        "Compra já vinculada a outro pagamento; verificação manual necessária",
      );
    await grant(
      db,
      "user:" + order.user_id,
      "topup:" + order.id,
      order.credits,
      approved,
    );
    await db.query(
      "UPDATE credit_orders SET payment_id=$2,status=$3,provider_id=COALESCE(provider_id,$4) WHERE id=$1",
      [
        order.id,
        approved || current.payment_id ? paymentId : null,
        approved
          ? "approved"
          : payment.status === "approved"
            ? "refunded"
            : String(payment.status),
        merchant.preference_id,
      ],
    );
  });
  return true;
}
