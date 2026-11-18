import { paymentConfig } from "./integrations.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { transaction, audit } from "./db.js";
import { HttpError } from "./errors.js";
import { grant } from "./credits.js";
import { reconcileTopup } from "./topups.js";
type Obj = Record<string, unknown>;
function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}
function str(v: unknown) {
  return v === undefined || v === null ? "" : String(v);
}
export class ProviderError extends HttpError {
  constructor(public upstreamStatus: number) {
    super(
      502,
      "Mercado Pago não confirmou a operação. Confira a configuração e tente novamente.",
    );
  }
}
export function billingReady(c: Config) {
  return (
    c.billingEnabled && !!c.mpToken && !!c.mpWebhookSecret && !!c.mpCollectorId
  );
}
export async function mp(
  c: Config,
  path: string,
  method = "GET",
  body?: unknown,
  idempotency?: string,
): Promise<Obj> {
  if (!c.mpToken)
    throw new HttpError(503, "Mercado Pago ainda não configurado");
  const headers: Record<string, string> = {
    Authorization: "Bearer " + c.mpToken,
    "Content-Type": "application/json",
  };
  if (idempotency) headers["X-Idempotency-Key"] = idempotency;
  const response = await fetch("https://api.mercadopago.com" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) throw new ProviderError(response.status);
  return obj(await response.json());
}
export function periodEnd(start: Date, months: number) {
  const target = new Date(start);
  const month = start.getUTCMonth() + months,
    year = start.getUTCFullYear() + Math.floor(month / 12),
    normalized = ((month % 12) + 12) % 12,
    last = new Date(Date.UTC(year, normalized + 1, 0)).getUTCDate();
  target.setUTCFullYear(year, normalized, Math.min(last, start.getUTCDate()));
  return target;
}
export async function checkout(
  pool: Pool,
  c: Config,
  userId: string,
  planId: string,
) {
  c = await paymentConfig(pool, c);
  if (!billingReady(c))
    throw new HttpError(
      503,
      "As assinaturas serão liberadas após a configuração do Mercado Pago",
    );
  const intent = await transaction(pool, async (db) => {
    const user = (
      await db.query("SELECT id,email FROM users WHERE id=$1 FOR UPDATE", [
        userId,
      ])
    ).rows[0];
    const existing = (
      await db.query(
        "SELECT * FROM subscriptions WHERE user_id=$1 AND status IN ('creating','pending','authorized','active','paused') ORDER BY created_at DESC LIMIT 1",
        [userId],
      )
    ).rows[0];
    if (existing) {
      if (existing.status === "pending" && existing.checkout_url)
        return { existing: existing.checkout_url };
      throw new HttpError(
        409,
        "Já existe uma assinatura ativa ou em processamento. Consulte seu painel antes de tentar outra.",
      );
    }
    const plan = (
      await db.query("SELECT * FROM plans WHERE id=$1 AND active=true", [
        planId,
      ])
    ).rows[0];
    if (!plan) throw new HttpError(404, "Plano indisponível");
    const id = randomUUID();
    await db.query(
      "INSERT INTO subscriptions(id,user_id,plan_id,status,amount_cents,interval_months,credits) VALUES($1,$2,$3,'creating',$4,$5,$6)",
      [
        id,
        userId,
        planId,
        plan.price_cents,
        plan.interval_months,
        plan.credits,
      ],
    );
    return { id, email: user.email, plan };
  });
  if (intent.existing) return { url: intent.existing };
  try {
    const result = await mp(
      c,
      "/preapproval",
      "POST",
      {
        reason: "GameForge AI " + intent.plan.name,
        external_reference: intent.id,
        payer_email: intent.email,
        auto_recurring: {
          frequency: intent.plan.interval_months,
          frequency_type: "months",
          transaction_amount: intent.plan.price_cents / 100,
          currency_id: "BRL",
        },
        back_url: c.appUrl + "/app/assinatura",
        status: "pending",
      },
      intent.id,
    );
    const providerId = str(result.id),
      url = str(result.init_point);
    if (
      !providerId ||
      !/^https:\/\/([a-z0-9-]+\.)*mercadopago\.(com|com\.br|com\.ar)\//i.test(
        url,
      )
    )
      throw new HttpError(502, "Checkout não confirmado pelo Mercado Pago");
    await pool.query(
      "UPDATE subscriptions SET provider_id=$2,checkout_url=$3,status=CASE WHEN status='creating' THEN 'pending' ELSE status END,updated_at=now() WHERE id=$1",
      [intent.id, providerId, url],
    );
    await audit(pool, userId, "billing.checkout_created", {
      subscriptionId: intent.id,
    });
    return { url };
  } catch (e) {
    if (
      e instanceof ProviderError &&
      e.upstreamStatus >= 400 &&
      e.upstreamStatus < 500 &&
      e.upstreamStatus !== 429
    )
      await pool.query(
        "UPDATE subscriptions SET status='failed',updated_at=now() WHERE id=$1",
        [intent.id],
      );
    throw new HttpError(
      502,
      "Não foi possível confirmar o checkout. Consulte a assinatura no painel; operações inconclusivas precisam de reconciliação antes de outra tentativa.",
    );
  }
}
export async function cancelSubscription(
  pool: Pool,
  c: Config,
  userId: string,
  id: string,
) {
  c = await paymentConfig(pool, c);
  const row = (
    await pool.query("SELECT * FROM subscriptions WHERE id=$1 AND user_id=$2", [
      id,
      userId,
    ])
  ).rows[0];
  if (!row?.provider_id) throw new HttpError(404, "Assinatura não localizada");
  const result = await mp(
    c,
    "/preapproval/" + encodeURIComponent(row.provider_id),
    "PUT",
    { status: c.mpCancelStatus },
  );
  if (!["canceled", "cancelled"].includes(str(result.status)))
    throw new HttpError(
      502,
      "O gateway não confirmou o cancelamento; a assinatura não foi alterada localmente",
    );
  await pool.query(
    "UPDATE subscriptions SET status='cancelled',cancel_at_period_end=true,updated_at=now() WHERE id=$1",
    [id],
  );
  await audit(pool, userId, "billing.cancelled", { subscriptionId: id });
}
async function invoiceList(c: Config, providerId: string) {
  const response = await mp(
    c,
    "/authorized_payments/search?preapproval_id=" +
      encodeURIComponent(providerId) +
      "&limit=100",
  );
  return Array.isArray(response.results) ? response.results.map(obj) : [];
}
export async function reconcileSubscription(
  pool: Pool,
  c: Config,
  providerId: string,
) {
  c = await paymentConfig(pool, c);
  const sub = await mp(c, "/preapproval/" + encodeURIComponent(providerId));
  const id = str(sub.external_reference);
  if (!/^[a-f0-9-]{36}$/i.test(id)) return;
  const row = (
    await pool.query("SELECT * FROM subscriptions WHERE id=$1", [id])
  ).rows[0];
  if (!row || (row.provider_id && row.provider_id !== providerId)) return;
  const status = str(sub.status);
  if (
    !["pending", "authorized", "paused", "cancelled", "canceled"].includes(
      status,
    )
  )
    return;
  await pool.query(
    "UPDATE subscriptions SET provider_id=COALESCE(provider_id,$2),status=$3,updated_at=now() WHERE id=$1",
    [id, providerId, status === "canceled" ? "cancelled" : status],
  );
  const invoices = await invoiceList(c, providerId);
  for (const invoice of invoices)
    await reconcileInvoice(pool, c, str(invoice.id));
}
export async function reconcileInvoice(
  pool: Pool,
  c: Config,
  invoiceId: string,
) {
  c = await paymentConfig(pool, c);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(invoiceId))
    throw new HttpError(400, "ID de fatura inválido");
  const invoice = await mp(
    c,
    "/authorized_payments/" + encodeURIComponent(invoiceId),
  );
  const sub = (
    await pool.query("SELECT * FROM subscriptions WHERE provider_id=$1", [
      str(invoice.preapproval_id),
    ])
  ).rows[0];
  if (!sub) return;
  const paymentId = str(obj(invoice.payment).id);
  if (!paymentId) return;
  const payment = await mp(c, "/v1/payments/" + encodeURIComponent(paymentId));
  const validReferences = [
    invoice.external_reference,
    payment.external_reference,
  ]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .every((v) => str(v) === sub.id);
  if (
    !validReferences ||
    str(payment.collector_id) !== c.mpCollectorId ||
    payment.live_mode !== c.mpLiveMode ||
    str(payment.currency_id) !== "BRL" ||
    str(invoice.currency_id) !== "BRL" ||
    Math.round(Number(payment.transaction_amount) * 100) !== sub.amount_cents ||
    Math.round(Number(invoice.transaction_amount) * 100) !== sub.amount_cents
  )
    throw new HttpError(
      409,
      "Pagamento não corresponde à assinatura contratada",
    );
  const start = new Date(str(invoice.debit_date));
  if (
    !Number.isFinite(start.getTime()) ||
    start.getTime() > Date.now() + 86400000
  )
    throw new HttpError(409, "Competência de cobrança inválida");
  const approved =
    payment.status === "approved" &&
    payment.status_detail === "accredited" &&
    Number(payment.transaction_amount_refunded || 0) === 0;
  const status = approved
    ? "approved"
    : str(payment.status) === "approved"
      ? "refunded"
      : str(payment.status);
  const end = periodEnd(start, sub.interval_months);
  await transaction(pool, async (db) => {
    await db.query("SELECT id FROM subscriptions WHERE id=$1 FOR UPDATE", [
      sub.id,
    ]);
    const old = (
      await db.query("SELECT * FROM payments WHERE invoice_id=$1 FOR UPDATE", [
        invoiceId,
      ])
    ).rows[0];
    if (old?.status === "approved" && old.provider_id !== paymentId)
      throw new HttpError(409, "Fatura já possui outro pagamento aprovado");
    await db.query(
      `INSERT INTO payments(provider_id,invoice_id,subscription_id,status,amount_cents,currency,period_start,period_end,paid_at) VALUES($1,$2,$3,$4,$5,'BRL',$6,$7,$8) ON CONFLICT(invoice_id) DO UPDATE SET provider_id=excluded.provider_id,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,paid_at=excluded.paid_at,updated_at=now()`,
      [
        paymentId,
        invoiceId,
        sub.id,
        status,
        sub.amount_cents,
        start,
        end,
        approved ? payment.date_approved || new Date() : null,
      ],
    );
    await grant(
      db,
      "user:" + sub.user_id,
      "invoice:" + invoiceId,
      sub.credits,
      approved,
    );
    await db.query(
      "UPDATE subscriptions SET paid_until=(SELECT MAX(period_end) FROM payments WHERE subscription_id=$1 AND status='approved'),updated_at=now() WHERE id=$1",
      [sub.id],
    );
  });
}
export async function reconcilePayment(
  pool: Pool,
  c: Config,
  paymentId: string,
) {
  c = await paymentConfig(pool, c);
  if (await reconcileTopup(pool, c, paymentId)) return;
  const saved = (
    await pool.query("SELECT invoice_id FROM payments WHERE provider_id=$1", [
      paymentId,
    ])
  ).rows[0];
  if (saved) return reconcileInvoice(pool, c, saved.invoice_id);
  const payment = await mp(c, "/v1/payments/" + encodeURIComponent(paymentId));
  const ref = str(payment.external_reference);
  if (!/^[a-f0-9-]{36}$/i.test(ref)) return;
  const sub = (
    await pool.query("SELECT provider_id FROM subscriptions WHERE id=$1", [ref])
  ).rows[0];
  if (sub?.provider_id) await reconcileSubscription(pool, c, sub.provider_id);
}
export async function workInbox(pool: Pool, c: Config) {
  c = await paymentConfig(pool, c);
  const rows = await transaction(pool, async (db) => {
    const selected = await db.query(
      "SELECT * FROM webhook_events WHERE (status IN ('pending','retry') AND available_at<=now()) OR (status='processing' AND locked_at<now()-interval '5 minutes') ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 5",
    );
    for (const row of selected.rows)
      await db.query(
        "UPDATE webhook_events SET status='processing',locked_at=now(),attempts=attempts+1 WHERE id=$1",
        [row.id],
      );
    return selected.rows;
  });
  for (const event of rows) {
    try {
      if (event.topic === "subscription_preapproval")
        await reconcileSubscription(pool, c, event.resource_id);
      else if (event.topic === "subscription_authorized_payment")
        await reconcileInvoice(pool, c, event.resource_id);
      else await reconcilePayment(pool, c, event.resource_id);
      await pool.query(
        "UPDATE webhook_events SET status='done',last_error=NULL WHERE id=$1",
        [event.id],
      );
    } catch {
      await pool.query(
        "UPDATE webhook_events SET status=$2,last_error=$3,available_at=now()+($4||' seconds')::interval WHERE id=$1",
        [
          event.id,
          event.attempts >= 9 ? "failed" : "retry",
          "Falha na reconciliação. Verifique o provedor e a configuração.",
          Math.min(3600, 30 * 2 ** event.attempts),
        ],
      );
    }
  }
}
