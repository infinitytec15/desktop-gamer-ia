import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { transaction, audit } from "./db.js";
import { secretToken, hashToken, signedEnvelope } from "./security.js";
import { HttpError } from "./errors.js";
export async function entitlement(db: Pool | PoolClient, licenseId: string) {
  const result = await db.query(
    `SELECT l.*,p.name plan_name,p.max_devices,p.ai_quota,p.features,u.status user_status,
CASE WHEN l.manual_subscription_id IS NOT NULL THEN (SELECT LEAST(l.expires_at,m.ends_at) FROM manual_subscriptions m WHERE m.id=l.manual_subscription_id AND m.status='active' AND m.ends_at>now()) WHEN l.source='manual' THEN l.expires_at ELSE (SELECT MAX(pay.period_end) FROM subscriptions s JOIN payments pay ON pay.subscription_id=s.id WHERE s.user_id=l.user_id AND s.plan_id=l.plan_id AND pay.status='approved' AND pay.period_start<=now() AND pay.period_end>now()) END valid_until
FROM licenses l JOIN plans p ON p.id=l.plan_id LEFT JOIN users u ON u.id=l.user_id WHERE l.id=$1`,
    [licenseId],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.revoked_at ||
    (row.user_status && row.user_status !== "active") ||
    !row.valid_until ||
    new Date(row.valid_until) <= new Date()
  )
    throw new HttpError(
      403,
      "Licença revogada, vencida ou sem pagamento confirmado",
    );
  return row;
}
export async function paidPlan(pool: Pool | PoolClient, userId: string) {
  const manual = (
    await pool.query(
      "SELECT m.*,m.ends_at paid_until,m.ends_at valid_until,p.name plan_name,p.max_devices,p.ai_quota,p.features,'manual' source,0 amount_cents,0 credits,1 interval_months FROM manual_subscriptions m JOIN plans p ON p.id=m.plan_id WHERE m.user_id=$1 AND m.status='active' AND m.ends_at>now() ORDER BY m.created_at DESC LIMIT 1",
      [userId],
    )
  ).rows[0];
  if (manual) return manual;

  const result = await pool.query(
    `SELECT s.*,p.name plan_name,p.max_devices,p.ai_quota,p.features FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND EXISTS(SELECT 1 FROM payments pay WHERE pay.subscription_id=s.id AND pay.status='approved' AND pay.period_start<=now() AND pay.period_end>now()) ORDER BY s.created_at DESC LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}
export async function createLicense(
  pool: Pool,
  c: Config,
  input: {
    userId: string | null;
    planId: string;
    source: "manual" | "subscription";
    days?: number;
  },
  actor: string,
) {
  const key = "GF_" + secretToken(),
    id = randomUUID();
  let manualId: string | null = null;
  let manualUntil: Date | null = null;
  await transaction(pool, async (db) => {
    if (input.userId)
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        input.userId,
      ]);
    if (input.source === "subscription") {
      const plan = await paidPlan(db, input.userId!);
      if (!plan || plan.plan_id !== input.planId)
        throw new HttpError(
          403,
          "Pagamento confirmado necessário para criar sua chave",
        );
      if (
        (
          await db.query(
            "SELECT id FROM licenses WHERE user_id=$1 AND plan_id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND (source='subscription' OR manual_subscription_id IS NOT NULL) LIMIT 1",
            [input.userId, input.planId],
          )
        ).rows.length
      )
        throw new HttpError(
          409,
          "Já existe uma chave ativa deste plano. Revogue a anterior antes de gerar outra.",
        );
      if (plan.source === "manual") {
        manualId = plan.id;
        manualUntil = new Date(plan.ends_at);
        input = { ...input, source: "manual" };
      }
    }
    const p = await db.query(
      "SELECT id FROM plans WHERE id=$1 AND active=true",
      [input.planId],
    );
    if (!p.rows.length) throw new HttpError(400, "Plano indisponível");
    await db.query(
      "INSERT INTO licenses(id,user_id,plan_id,key_hash,key_prefix,source,expires_at,manual_subscription_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        input.userId,
        input.planId,
        hashToken(key, c.licensePepper),
        key.slice(0, 11),
        input.source,
        manualUntil ||
          (input.source === "manual"
            ? new Date(Date.now() + (input.days || 30) * 86400000)
            : null),
        manualId,
      ],
    );
  });
  await audit(pool, actor, "license.created", {
    id,
    planId: input.planId,
    source: input.source,
  });
  return { id, key, prefix: key.slice(0, 11) };
}
export function lease(
  c: Config,
  row: Record<string, unknown>,
  deviceId: string,
) {
  const now = Math.floor(Date.now() / 1000),
    until = Math.floor(new Date(String(row.valid_until)).getTime() / 1000);
  return signedEnvelope(
    {
      aud: "gameforge-desktop",
      iss: c.appUrl,
      license_id: row.id,
      device_id: deviceId,
      plan_id: row.plan_id,
      features: row.features,
      max_devices: row.max_devices,
      iat: now,
      exp: Math.min(until, now + 86400),
    },
    c.privateKey,
  );
}
export async function activate(
  pool: Pool,
  c: Config,
  key: string,
  fingerprint: string,
  name: string,
  platform: string,
) {
  return transaction(pool, async (db) => {
    const found = await db.query(
      "SELECT id FROM licenses WHERE key_hash=$1 FOR UPDATE",
      [hashToken(key, c.licensePepper)],
    );
    if (!found.rows.length) throw new HttpError(403, "Chave inválida");
    const license = await entitlement(db, found.rows[0].id);
    const previous = await db.query(
      "SELECT * FROM devices WHERE license_id=$1 AND fingerprint=$2",
      [license.id, fingerprint],
    );
    if (previous.rows[0]?.revoked_at)
      throw new HttpError(
        403,
        "Este dispositivo foi revogado. Entre na sua conta para obter suporte",
      );
    let deviceId = previous.rows[0]?.id;
    if (!deviceId) {
      const count = await db.query(
        "SELECT count(*)::int total FROM devices WHERE license_id=$1 AND revoked_at IS NULL",
        [license.id],
      );
      if (count.rows[0].total >= license.max_devices)
        throw new HttpError(
          409,
          "Limite de dispositivos atingido. Remova um dispositivo no painel",
        );
      deviceId = randomUUID();
    }
    const token = secretToken();
    await db.query(
      "INSERT INTO devices(id,license_id,fingerprint,name,platform,token_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(license_id,fingerprint) DO UPDATE SET token_hash=excluded.token_hash,name=excluded.name,platform=excluded.platform,last_seen=now()",
      [
        deviceId,
        license.id,
        fingerprint,
        name,
        platform,
        hashToken(token, c.licensePepper),
      ],
    );
    return {
      refresh_token: token,
      device_id: deviceId,
      entitlements: lease(c, license, deviceId),
    };
  });
}
export async function deviceAuth(pool: Pool, c: Config, token: string) {
  const result = await pool.query(
    "SELECT d.* FROM devices d WHERE d.token_hash=$1 AND d.revoked_at IS NULL",
    [hashToken(token, c.licensePepper)],
  );
  if (!result.rows[0]) throw new HttpError(401, "Dispositivo não autorizado");
  const device = result.rows[0];
  const license = await entitlement(pool, device.license_id);
  await pool.query("UPDATE devices SET last_seen=now() WHERE id=$1", [
    device.id,
  ]);
  return { device, license };
}
