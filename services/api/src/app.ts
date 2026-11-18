import { accountActor, generatePrinting } from "./printing.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import helmet from "helmet";

import { z, ZodError } from "zod";

import { randomUUID, createHash } from "node:crypto";

import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

import type { Config } from "./config.js";

import { audit } from "./db.js";

import { HttpError } from "./errors.js";

import {
  sessionMiddleware,
  csrf,
  requireUser,
  requireAdmin,
  issueSession,
  logout,
  rateLimit,
} from "./auth.js";

import {
  passwordHash,
  passwordCheck,
  constantEqual,
  encrypt,
  publicRaw,
  verifyWebhook,
} from "./security.js";

import {
  activate,
  createLicense,
  deviceAuth,
  lease,
  paidPlan,
} from "./license.js";

import {
  billingReady,
  checkout,
  cancelSubscription,
  reconcileSubscription,
} from "./billing.js";

import { wallet, commercial, assertMargin, move, MICRO } from "./credits.js";

import { topupCheckout, reconcileTopup } from "./topups.js";

import { transaction } from "./db.js";

import { generatePlan } from "./planner.js";

const uuid = z.uuid();

const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(12).max(200),
});

function id(req: Request) {
  return uuid.parse(req.params.id);
}

function bearer(req: Request) {
  const token = req
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/)?.[1];
  if (!token) throw new HttpError(401, "Ative este computador com sua chave");
  return token;
}

export function createApp(pool: Pool, c: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: c.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.json({ limit: "32kb" }));

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });

  app.use("/api", sessionMiddleware(pool, c));
  app.use(csrf(c));

  app.get("/api/public", async (_req, res) => {
    const plans = (
      await pool.query(
        "SELECT id,name,price_cents,interval_months,max_devices,credits FROM plans WHERE active=true ORDER BY price_cents",
      )
    ).rows;
    const packages = (
      await pool.query(
        "SELECT * FROM credit_packages WHERE active=true ORDER BY credits",
      )
    ).rows;
    res.json({
      plans,
      packages,
      billing_enabled: billingReady(c),
      download_available: !!c.downloadUrl,
      download_url: c.downloadUrl || null,
    });
  });

  app.get("/api/me", (req, res) => res.json({ user: req.auth || null }));

  app.post("/api/auth/register", async (req, res) => {
    await rateLimit(pool, c, "register:" + req.ip, 6, 3600);
    const b = credentials
      .extend({ name: z.string().trim().min(2).max(80) })
      .parse(req.body);
    if (b.email === c.adminEmail)
      throw new HttpError(409, "Este endereço não está disponível");
    const userId = randomUUID();
    await pool.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [userId, b.email, b.name, await passwordHash(b.password)],
    );
    await issueSession(pool, c, res, userId, "user");
    await audit(pool, userId, "user.registered");
    res.status(201).json({ ok: true });
  });

  app.post("/api/auth/login", async (req, res) => {
    await rateLimit(pool, c, "login:" + req.ip, 20, 900);
    const b = credentials.parse(req.body);
    await rateLimit(pool, c, "login-email:" + b.email, 12, 900);
    const row = (
      await pool.query("SELECT * FROM users WHERE email=$1", [b.email])
    ).rows[0];
    const valid = await passwordCheck(
      b.password,
      row?.password_hash || (await passwordHash("invalid-account-constant")),
    );
    if (!row || !valid || row.status !== "active")
      throw new HttpError(401, "E-mail ou senha incorretos");
    await issueSession(pool, c, res, row.id, "user");
    res.json({ ok: true });
  });

  app.post("/api/auth/admin", async (req, res) => {
    await rateLimit(pool, c, "admin:" + req.ip, 10, 900);
    const b = credentials.parse(req.body);
    if (
      !constantEqual(b.email, c.adminEmail) ||
      !constantEqual(b.password, c.adminPassword)
    )
      throw new HttpError(401, "E-mail ou senha incorretos");
    await issueSession(pool, c, res, null, "admin");
    await audit(pool, "admin", "admin.login");
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", async (req, res) => {
    await logout(pool, c, req, res);
    res.json({ ok: true });
  });

  app.post("/api/account/password", requireUser, async (req, res) => {
    await rateLimit(pool, c, "password:" + req.auth!.userId, 5, 3600);
    const b = z
      .object({
        current: z.string().max(200),
        password: z.string().min(12).max(200),
      })
      .parse(req.body);
    const row = (
      await pool.query("SELECT password_hash FROM users WHERE id=$1", [
        req.auth!.userId,
      ])
    ).rows[0];
    if (!(await passwordCheck(b.current, row.password_hash)))
      throw new HttpError(403, "Senha atual incorreta");
    await pool.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
      req.auth!.userId,
      await passwordHash(b.password),
    ]);
    await pool.query("DELETE FROM sessions WHERE user_id=$1", [
      req.auth!.userId,
    ]);
    await issueSession(pool, c, res, req.auth!.userId, "user");
    await audit(pool, req.auth!.userId!, "user.password_changed");
    res.json({ ok: true });
  });

  app.get("/api/account", requireUser, async (req, res) => {
    const uid = req.auth!.userId;
    const subscriptions = (
      await pool.query(
        "SELECT s.*,p.name plan_name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 50",
        [uid],
      )
    ).rows;
    const licenses = (
      await pool.query(
        "SELECT l.id,l.key_prefix,l.plan_id,l.source,l.expires_at,l.revoked_at,l.created_at,p.name plan_name FROM licenses l JOIN plans p ON p.id=l.plan_id WHERE user_id=$1 ORDER BY l.created_at DESC",
        [uid],
      )
    ).rows;
    const devices = (
      await pool.query(
        "SELECT d.id,d.name,d.platform,d.last_seen,d.revoked_at,l.key_prefix FROM devices d JOIN licenses l ON l.id=d.license_id WHERE l.user_id=$1 ORDER BY d.last_seen DESC",
        [uid],
      )
    ).rows;
    const payments = (
      await pool.query(
        "SELECT pay.provider_id,pay.status,pay.amount_cents,pay.period_end,pay.paid_at FROM payments pay JOIN subscriptions s ON s.id=pay.subscription_id WHERE s.user_id=$1 ORDER BY pay.period_start DESC LIMIT 50",
        [uid],
      )
    ).rows;
    const plan = await paidPlan(pool, uid!);
    const usage =
      (
        await pool.query(
          "SELECT analyses FROM ai_usage WHERE user_key=$1 AND month=$2",
          ["user:" + uid, new Date().toISOString().slice(0, 7)],
        )
      ).rows[0]?.analyses || 0;
    const credits = await wallet(pool, "user:" + uid);
    const orders = (
      await pool.query(
        "SELECT id,credits,amount_cents,status,checkout_url,created_at FROM credit_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        [uid],
      )
    ).rows;
    res.json({
      subscriptions,
      licenses,
      devices,
      payments,
      plan,
      usage,
      credits,
      orders,
    });
  });

  app.post("/api/account/checkout", requireUser, async (req, res) => {
    await rateLimit(pool, c, "checkout:" + req.auth!.userId, 5, 3600);
    const { planId } = z.object({ planId: z.string().max(40) }).parse(req.body);
    res.json(await checkout(pool, c, req.auth!.userId!, planId));
  });

  app.post(
    "/api/account/subscriptions/:id/cancel",
    requireUser,
    async (req, res) => {
      await cancelSubscription(pool, c, req.auth!.userId!, id(req));
      res.json({ ok: true });
    },
  );

  app.post(
    "/api/account/subscriptions/:id/sync",
    requireUser,
    async (req, res) => {
      await rateLimit(pool, c, "sync:" + req.auth!.userId, 10, 900);
      const row = (
        await pool.query(
          "SELECT provider_id FROM subscriptions WHERE id=$1 AND user_id=$2",
          [id(req), req.auth!.userId],
        )
      ).rows[0];
      if (!row?.provider_id)
        throw new HttpError(404, "Assinatura não localizada");
      await reconcileSubscription(pool, c, row.provider_id);
      res.json({ ok: true });
    },
  );

  app.post("/api/account/topups", requireUser, async (req, res) => {
    await rateLimit(pool, c, "topup:" + req.auth!.userId, 10, 3600);
    const { packageId } = z
      .object({ packageId: z.string().max(40) })
      .parse(req.body);
    res.json(await topupCheckout(pool, c, req.auth!.userId!, packageId));
  });

  app.post("/api/account/licenses", requireUser, async (req, res) => {
    await rateLimit(pool, c, "key:" + req.auth!.userId, 10, 3600);
    const plan = await paidPlan(pool, req.auth!.userId!);
    if (!plan)
      throw new HttpError(
        403,
        "Confirme sua assinatura antes de gerar uma chave",
      );
    res.status(201).json(
      await createLicense(
        pool,
        c,
        {
          userId: req.auth!.userId!,
          planId: plan.plan_id,
          source: "subscription",
        },
        req.auth!.userId!,
      ),
    );
  });

  app.post(
    "/api/account/licenses/:id/revoke",
    requireUser,
    async (req, res) => {
      const result = await pool.query(
        "UPDATE licenses SET revoked_at=now() WHERE id=$1 AND user_id=$2 RETURNING id",
        [id(req), req.auth!.userId],
      );
      if (!result.rows.length) throw new HttpError(404, "Chave não localizada");
      await audit(pool, req.auth!.userId!, "license.revoked", { id: id(req) });
      res.json({ ok: true });
    },
  );

  app.post("/api/account/devices/:id/revoke", requireUser, async (req, res) => {
    const result = await pool.query(
      "UPDATE devices SET revoked_at=now() WHERE id=$1 AND license_id IN (SELECT id FROM licenses WHERE user_id=$2) RETURNING id",
      [id(req), req.auth!.userId],
    );
    if (!result.rows.length)
      throw new HttpError(404, "Dispositivo não localizado");
    await audit(pool, req.auth!.userId!, "device.revoked", { id: id(req) });
    res.json({ ok: true });
  });

  app.post("/api/desktop/activate", async (req, res) => {
    await rateLimit(pool, c, "activation:" + req.ip, 20, 900);
    const b = z
      .object({
        key: z.string().regex(/^GF_[A-Za-z0-9_-]{43}$/),
        fingerprint: z.string().regex(/^[a-zA-Z0-9_-]{20,100}$/),
        name: z.string().trim().min(1).max(80),
        platform: z.enum(["windows", "macos", "linux"]),
      })
      .parse(req.body);
    res.json(await activate(pool, c, b.key, b.fingerprint, b.name, b.platform));
  });

  app.post("/api/desktop/refresh", async (req, res) => {
    await rateLimit(pool, c, "refresh:" + req.ip, 120, 900);
    const { device, license } = await deviceAuth(pool, c, bearer(req));
    res.json({ entitlements: lease(c, license, device.id) });
  });

  app.post("/api/desktop/deactivate", async (req, res) => {
    const { device } = await deviceAuth(pool, c, bearer(req));
    await pool.query("UPDATE devices SET revoked_at=now() WHERE id=$1", [
      device.id,
    ]);
    res.json({ ok: true });
  });

  app.post("/api/account/printing/ai", requireUser, async (req, res) => {
    await rateLimit(pool, c, "printing-ai:" + req.auth!.userId, 10, 60);
    res.json(
      await generatePrinting(
        pool,
        c,
        await accountActor(pool, req.auth!.userId!),
        req.body,
      ),
    );
  });
  app.post("/api/desktop/printing/ai", async (req, res) => {
    const { device, license } = await deviceAuth(pool, c, bearer(req));
    if (!license.features.includes("ai_plans"))
      throw new HttpError(403, "Seu plano não inclui IA");
    await rateLimit(pool, c, "ai:" + device.id, 10, 60);
    res.json(
      await generatePrinting(
        pool,
        c,
        {
          deviceId: device.id,
          licenseId: license.id,
          walletKey: license.user_id
            ? "user:" + license.user_id
            : "license:" + license.id,
        },
        req.body,
      ),
    );
  });
  app.post("/api/desktop/ai/plan", async (req, res) => {
    const { device, license } = await deviceAuth(pool, c, bearer(req));
    await rateLimit(pool, c, "ai:" + device.id, 10, 60);
    res.json(await generatePlan(pool, c, device, license, req.body));
  });

  app.post("/api/webhooks/mercadopago", async (req, res) => {
    const dataId = req.query["data.id"];
    const signature = req.get("x-signature") || "",
      requestId = req.get("x-request-id") || "";
    if (
      !c.mpWebhookSecret ||
      typeof dataId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(dataId) ||
      !verifyWebhook(c.mpWebhookSecret, signature, requestId, dataId)
    )
      throw new HttpError(401, "Assinatura do webhook inválida");
    const topic = req.body?.type;
    if (
      ![
        "subscription_preapproval",
        "subscription_authorized_payment",
        "payment",
      ].includes(topic)
    )
      return res.status(200).json({ ignored: true });
    if (
      req.body?.data?.id !== undefined &&
      String(req.body.data.id).toLowerCase() !== dataId.toLowerCase()
    )
      throw new HttpError(400, "Notificação inconsistente");
    const eventKey = createHash("sha256")
      .update(topic + ":" + dataId + ":" + requestId + ":" + signature)
      .digest("hex");
    await pool.query(
      "INSERT INTO webhook_events(event_key,topic,resource_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [eventKey, topic, dataId],
    );
    res.status(201).json({ received: true });
  });

  app.use("/api/admin", requireAdmin);

  app.get("/api/admin/dashboard", async (_req, res) => {
    const stats = (
      await pool.query(
        `SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM subscriptions WHERE paid_until>now()) paid_subscriptions,(SELECT count(*)::int FROM licenses WHERE revoked_at IS NULL) licenses,(SELECT COALESCE(sum(amount_cents),0)::bigint FROM payments WHERE status='approved' AND paid_at>now()-interval '30 days') revenue_30d,(SELECT count(*)::int FROM webhook_events WHERE status='failed') failed_events`,
      )
    ).rows[0];
    const chart = (
      await pool.query(
        `SELECT to_char(d,'DD/MM') AS day,COALESCE(sum(p.amount_cents),0)::int amount FROM generate_series(current_date-13,current_date,'1 day'::interval) d LEFT JOIN payments p ON p.paid_at>=d AND p.paid_at<d+interval '1 day' AND p.status='approved' GROUP BY d ORDER BY d`,
      )
    ).rows;
    const activity = (
      await pool.query(
        "SELECT id,actor,event,metadata,created_at FROM audit_log ORDER BY id DESC LIMIT 20",
      )
    ).rows;
    res.json({ stats, chart, activity });
  });

  function listArgs(req: Request) {
    return [
      "%" +
        z
          .string()
          .max(120)
          .parse(req.query.q || "") +
        "%",
      z.coerce
        .number()
        .int()
        .min(0)
        .max(10000000)
        .parse(req.query.offset || 0),
    ];
  }
  app.get("/api/admin/users", async (req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT u.id,u.email,u.name,u.status,u.created_at,(SELECT count(*)::int FROM licenses l WHERE l.user_id=u.id AND l.revoked_at IS NULL) licenses FROM users u WHERE u.email ILIKE $1 OR u.name ILIKE $1 ORDER BY created_at DESC,u.id DESC LIMIT 50 OFFSET $2`,
          listArgs(req),
        )
      ).rows,
    ),
  );
  app.post("/api/admin/users/:id/status", async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["active", "blocked"]) })
      .parse(req.body);
    const result = await pool.query(
      "UPDATE users SET status=$2 WHERE id=$1 RETURNING id",
      [id(req), status],
    );
    if (!result.rows.length) throw new HttpError(404, "Usuário não localizado");
    await audit(pool, "admin", "user.status", { id: id(req), status });
    res.json({ ok: true });
  });

  app.get("/api/admin/subscriptions", async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT s.*,u.email,p.name plan_name FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN plans p ON p.id=s.plan_id WHERE u.email ILIKE $1 OR COALESCE(s.provider_id,'') ILIKE $1 OR s.id::text ILIKE $1 ORDER BY s.created_at DESC,s.id DESC LIMIT 50 OFFSET $2",
          listArgs(req),
        )
      ).rows,
    ),
  );

  app.post("/api/admin/subscriptions/:id/sync", async (req, res) => {
    const row = (
      await pool.query("SELECT provider_id FROM subscriptions WHERE id=$1", [
        id(req),
      ])
    ).rows[0];
    if (!row?.provider_id)
      throw new HttpError(
        409,
        "Sem ID do provedor. Reconcilie pela referência externa no Mercado Pago",
      );
    await reconcileSubscription(pool, c, row.provider_id);
    await audit(pool, "admin", "billing.sync", { id: id(req) });
    res.json({ ok: true });
  });

  app.post("/api/admin/subscriptions/:id/link", async (req, res) => {
    const { providerId } = z
      .object({ providerId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) })
      .parse(req.body);
    const row = (
      await pool.query("SELECT id FROM subscriptions WHERE id=$1", [id(req)])
    ).rows[0];
    if (!row) throw new HttpError(404, "Assinatura não localizada");
    const { mp } = await import("./billing.js");
    const canonical = await mp(c, "/preapproval/" + providerId);
    if (canonical.external_reference !== row.id)
      throw new HttpError(409, "Referência externa não corresponde");
    await reconcileSubscription(pool, c, providerId);
    await audit(pool, "admin", "billing.link", { id: id(req), providerId });
    res.json({ ok: true });
  });

  app.get("/api/admin/licenses", async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT l.id,l.user_id,l.key_prefix,l.source,l.expires_at,l.revoked_at,l.created_at,p.name plan_name,u.email,(SELECT count(*)::int FROM devices d WHERE d.license_id=l.id AND d.revoked_at IS NULL) devices FROM licenses l JOIN plans p ON p.id=l.plan_id LEFT JOIN users u ON u.id=l.user_id WHERE COALESCE(u.email,'') ILIKE $1 OR l.key_prefix ILIKE $1 OR l.id::text ILIKE $1 ORDER BY l.created_at DESC,l.id DESC LIMIT 50 OFFSET $2",
          listArgs(req),
        )
      ).rows,
    ),
  );

  app.post("/api/admin/licenses", async (req, res) => {
    const b = z
      .object({
        email: z.email().optional(),
        planId: z.string().max(40),
        days: z.number().int().min(1).max(366),
      })
      .parse(req.body);
    const user = b.email
      ? (
          await pool.query("SELECT id FROM users WHERE email=$1", [
            b.email.toLowerCase(),
          ])
        ).rows[0]
      : null;
    if (b.email && !user)
      throw new HttpError(
        404,
        "Crie a conta do usuário antes de vincular a chave",
      );
    res.status(201).json(
      await createLicense(
        pool,
        c,
        {
          userId: user?.id || null,
          planId: b.planId,
          source: "manual",
          days: b.days,
        },
        "admin",
      ),
    );
  });

  app.post("/api/admin/licenses/:id/revoke", async (req, res) => {
    const result = await pool.query(
      "UPDATE licenses SET revoked_at=now() WHERE id=$1 RETURNING id",
      [id(req)],
    );
    if (!result.rows.length) throw new HttpError(404, "Chave não localizada");
    await audit(pool, "admin", "license.revoked", { id: id(req) });
    res.json({ ok: true });
  });

  app.get("/api/admin/plans", async (_req, res) =>
    res.json(
      (await pool.query("SELECT * FROM plans ORDER BY price_cents")).rows,
    ),
  );

  app.post("/api/admin/plans/:planId", async (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(40),
        price_cents: z.number().int().min(100).max(1000000),
        max_devices: z.number().int().min(1).max(20),
        credits: z.number().int().min(1).max(1000000),
        active: z.boolean(),
      })
      .parse(req.body);
    await assertMargin(pool, b.price_cents, b.credits);
    const result = await pool.query(
      "UPDATE plans SET name=$2,price_cents=$3,max_devices=$4,credits=$5,active=$6 WHERE id=$1 RETURNING id",
      [
        req.params.planId,
        b.name,
        b.price_cents,
        b.max_devices,
        b.credits,
        b.active,
      ],
    );
    if (!result.rows.length) throw new HttpError(404, "Plano não localizado");
    await audit(pool, "admin", "plan.updated", { id: req.params.planId, ...b });
    res.json({ ok: true });
  });

  app.get("/api/admin/commercial", async (_req, res) =>
    res.json({
      settings: await commercial(pool),
      packages: (
        await pool.query("SELECT * FROM credit_packages ORDER BY credits")
      ).rows,
      rates: {
        anthropic: { input: 4, output: 20 },
        openai: { input: 2, output: 10 },
      },
      unit: "1 crédito = US$ 0,001 de uso Standard",
    }),
  );

  app.post("/api/admin/commercial", async (req, res) => {
    const b = z
      .object({
        fx: z.number().min(1).max(100),
        fee_pct: z.number().min(0).max(50),
        reserve_pct: z.number().min(0).max(50),
        min_margin_pct: z.number().min(10).max(90),
      })
      .parse(req.body);
    if (b.fee_pct + b.reserve_pct + b.min_margin_pct >= 100)
      throw new HttpError(
        400,
        "Reservas e margem devem totalizar menos de 100%",
      );
    await pool.query(
      "UPDATE commercial_settings SET fx=$1,fee_pct=$2,reserve_pct=$3,min_margin_pct=$4 WHERE id=true",
      [b.fx, b.fee_pct, b.reserve_pct, b.min_margin_pct],
    );
    await audit(pool, "admin", "commercial.updated", b);
    res.json({ ok: true });
  });

  app.post("/api/admin/packages/:packageId", async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2).max(40),
        credits: z.number().int().min(1).max(1000000),
        price_cents: z.number().int().min(100).max(1000000),
        active: z.boolean(),
      })
      .parse(req.body);
    await assertMargin(pool, b.price_cents, b.credits);
    await pool.query(
      "UPDATE credit_packages SET name=$2,credits=$3,price_cents=$4,active=$5 WHERE id=$1",
      [req.params.packageId, b.name, b.credits, b.price_cents, b.active],
    );
    await audit(pool, "admin", "package.updated", {
      id: req.params.packageId,
      ...b,
    });
    res.json({ ok: true });
  });

  app.post("/api/admin/credits", async (req, res) => {
    const b = z
      .object({
        email: z.email().optional(),
        licenseId: z.uuid().optional(),
        credits: z.number().int().min(-100000).max(100000),
        reason: z.string().min(5).max(200),
      })
      .refine((v) => !!v.email !== !!v.licenseId)
      .parse(req.body);
    let key;
    if (b.email) {
      const row = (
        await pool.query("SELECT id FROM users WHERE email=$1", [
          b.email.toLowerCase(),
        ])
      ).rows[0];
      if (!row) throw new HttpError(404, "Usuário não localizado");
      key = "user:" + row.id;
    } else {
      const row = (
        await pool.query("SELECT id,user_id FROM licenses WHERE id=$1", [
          b.licenseId,
        ])
      ).rows[0];
      if (!row) throw new HttpError(404, "Licença não localizada");
      key = row.user_id ? "user:" + row.user_id : "license:" + row.id;
    }
    await transaction(pool, (db) =>
      move(db, key!, b.credits * MICRO, "admin_adjustment", b.reason),
    );
    await audit(pool, "admin", "credits.adjusted", {
      key,
      credits: b.credits,
      reason: b.reason,
    });
    res.json({ ok: true });
  });

  app.post("/api/admin/topups/:id/sync", async (req, res) => {
    const { paymentId } = z
      .object({ paymentId: z.string().regex(/^\d{1,40}$/) })
      .parse(req.body);
    const order = (
      await pool.query("SELECT id FROM credit_orders WHERE id=$1", [id(req)])
    ).rows[0];
    if (!order) throw new HttpError(404, "Recarga não localizada");
    const { mp } = await import("./billing.js");
    const payment = await mp(c, "/v1/payments/" + paymentId);
    if (payment.external_reference !== order.id)
      throw new HttpError(409, "Pagamento divergente");
    await reconcileTopup(pool, c, paymentId);
    res.json({ ok: true });
  });

  app.get("/api/admin/topups", async (_req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT o.*,u.email FROM credit_orders o JOIN users u ON u.id=o.user_id ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
    ),
  );

  app.get("/api/admin/config", async (_req, res) => {
    const saved = (
      await pool.query(
        "SELECT provider,last_four,updated_at FROM provider_credentials",
      )
    ).rows;
    res.json({
      app_url: c.appUrl,
      public_key: publicRaw(c.privateKey),
      billing_enabled: billingReady(c),
      mercadopago: {
        token: !!c.mpToken,
        webhook: !!c.mpWebhookSecret,
        collector: !!c.mpCollectorId,
        live_mode: c.mpLiveMode,
      },
      download_url: c.downloadUrl,
      providers: ["anthropic", "openai"].map((provider) => ({
        provider,
        last_four:
          saved.find((s) => s.provider === provider)?.last_four || null,
        environment:
          !!process.env[
            provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"
          ],
      })),
      models: {
        anthropic: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
        openai: process.env.OPENAI_MODEL || "gpt-6.1-sol",
      },
    });
  });

  app.post("/api/admin/providers/:provider", async (req, res) => {
    const provider = z.enum(["anthropic", "openai"]).parse(req.params.provider),
      { key } = z
        .object({ key: z.string().trim().min(20).max(2400) })
        .parse(req.body);
    await pool.query(
      "INSERT INTO provider_credentials(provider,encrypted_value,last_four) VALUES($1,$2,$3) ON CONFLICT(provider) DO UPDATE SET encrypted_value=excluded.encrypted_value,last_four=excluded.last_four,updated_at=now()",
      [provider, encrypt(key, c.encryptionKey), key.slice(-4)],
    );
    await audit(pool, "admin", "provider.updated", { provider });
    res.json({ ok: true });
  });

  app.delete("/api/admin/providers/:provider", async (req, res) => {
    const provider = z.enum(["anthropic", "openai"]).parse(req.params.provider);
    await pool.query("DELETE FROM provider_credentials WHERE provider=$1", [
      provider,
    ]);
    await audit(pool, "admin", "provider.removed", { provider });
    res.json({ ok: true });
  });

  app.get("/api/admin/events", async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT id,topic,resource_id,status,attempts,last_error,created_at FROM webhook_events WHERE resource_id ILIKE $1 OR topic ILIKE $1 OR status ILIKE $1 ORDER BY id DESC LIMIT 50 OFFSET $2",
          listArgs(req),
        )
      ).rows,
    ),
  );

  app.post("/api/admin/events/:eventId/retry", async (req, res) => {
    const eventId = z.string().regex(/^\d+$/).parse(req.params.eventId);
    await pool.query(
      "UPDATE webhook_events SET status='retry',attempts=0,available_at=now(),locked_at=NULL WHERE id=$1 AND status IN ('failed','retry')",
      [eventId],
    );
    await audit(pool, "admin", "webhook.retry", { id: eventId });
    res.json({ ok: true });
  });

  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Recurso não encontrado")),
  );

  const web = fileURLToPath(
    new URL("../../../apps/web/dist/", import.meta.url),
  );
  app.use(
    express.static(web, {
      index: false,
      maxAge: "1h",
      setHeaders(res, path) {
        if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  app.get("/{*path}", (_req, res) => res.sendFile(web + "index.html"));

  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof ZodError)
        return res.status(400).json({
          error: "Dados inválidos. Confira os campos.",
          fields: error.issues.map((i) => i.path.join(".")),
        });
      const code = (error as { code?: string; type?: string })?.code;
      if (code === "23505")
        return res.status(409).json({
          error:
            "Já existe um registro com estes dados. Atualize o painel para conferir.",
        });
      if (code === "23503" || code === "22P02")
        return res.status(400).json({ error: "Referência inválida" });
      if ((error as { type?: string })?.type === "entity.parse.failed")
        return res.status(400).json({ error: "JSON inválido" });
      if ((error as { type?: string })?.type === "entity.too.large")
        return res.status(413).json({ error: "Requisição excede o limite" });
      console.error(
        "Falha de API",
        error instanceof Error ? error.name : "Unknown",
        code || "",
      );
      res.status(500).json({
        error: "Não foi possível concluir. Tente novamente em instantes.",
      });
    },
  );

  return app;
}
