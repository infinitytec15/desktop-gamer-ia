import { z } from "zod";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { encrypt, decrypt } from "./security.js";
import { transaction, audit } from "./db.js";
import { HttpError } from "./errors.js";
const scope = "integration:mercadopago";
const storedSchema = z.strictObject({
  access_token: z.string().trim().min(20).max(2400).optional(),
  webhook_secret: z.string().trim().min(16).max(2400).optional(),
  collector_id: z
    .string()
    .regex(/^\d{1,40}$/)
    .optional(),
  public_key: z.string().trim().min(20).max(2400).optional(),
  live_mode: z.boolean().optional(),
  billing_enabled: z.boolean().optional(),
});
export async function paymentConfig(pool: Pool, c: Config): Promise<Config> {
  const row = (
    await pool.query(
      "SELECT encrypted_value FROM integration_credentials WHERE name='mercadopago'",
    )
  ).rows[0];
  if (!row) return c;
  const value = storedSchema.parse(
    JSON.parse(decrypt(row.encrypted_value, c.encryptionKey, scope)),
  );
  return {
    ...c,
    mpToken: value.access_token ?? c.mpToken,
    mpWebhookSecret: value.webhook_secret ?? c.mpWebhookSecret,
    mpCollectorId: value.collector_id ?? c.mpCollectorId,
    mpLiveMode: value.live_mode ?? c.mpLiveMode,
    billingEnabled: value.billing_enabled ?? c.billingEnabled,
  };
}
export async function paymentStatus(pool: Pool, c: Config) {
  const effective = await paymentConfig(pool, c);
  const row = (
    await pool.query(
      "SELECT encrypted_value,updated_at FROM integration_credentials WHERE name='mercadopago'",
    )
  ).rows[0];
  const value = row
    ? storedSchema.parse(
        JSON.parse(decrypt(row.encrypted_value, c.encryptionKey, scope)),
      )
    : {};
  return {
    token: !!effective.mpToken,
    webhook: !!effective.mpWebhookSecret,
    collector: !!effective.mpCollectorId,
    public_key: !!value.public_key,
    live_mode: effective.mpLiveMode,
    billing_enabled: effective.billingEnabled,
    webhook_url: c.appUrl + "/api/webhooks/mercadopago",
    stored: !!row,
    updated_at: row?.updated_at || null,
  };
}
export async function savePayment(pool: Pool, c: Config, body: unknown) {
  const b = storedSchema.parse(body);
  await transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(57369105)");
    const old = (
      await db.query(
        "SELECT encrypted_value FROM integration_credentials WHERE name='mercadopago' FOR UPDATE",
      )
    ).rows[0];
    const previous = old
      ? storedSchema.parse(
          JSON.parse(decrypt(old.encrypted_value, c.encryptionKey, scope)),
        )
      : {};
    const next = { ...previous, ...b };
    if (
      (next.billing_enabled && !(next.access_token || c.mpToken)) ||
      (next.billing_enabled && !(next.webhook_secret || c.mpWebhookSecret)) ||
      (next.billing_enabled && !(next.collector_id || c.mpCollectorId))
    )
      throw new HttpError(
        400,
        "Preencha token, segredo do webhook e vendedor antes de habilitar cobrança",
      );
    await db.query(
      "INSERT INTO credential_history(name,encrypted_before) VALUES('mercadopago',$1)",
      [old?.encrypted_value || null],
    );
    await db.query(
      "INSERT INTO integration_credentials(name,encrypted_value) VALUES('mercadopago',$1) ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value,updated_at=now()",
      [encrypt(JSON.stringify(next), c.encryptionKey, scope)],
    );
  });
  await audit(pool, "admin", "payment.configured", { fields: Object.keys(b) });
}
export async function restorePayment(pool: Pool, c: Config) {
  await transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(57369105)");
    const previous = (
      await db.query(
        "SELECT id,encrypted_before FROM credential_history WHERE name='mercadopago' ORDER BY id DESC LIMIT 1 FOR UPDATE",
      )
    ).rows[0];
    if (!previous)
      throw new HttpError(404, "Não há configuração anterior para restaurar");
    if (previous.encrypted_before) {
      storedSchema.parse(
        JSON.parse(decrypt(previous.encrypted_before, c.encryptionKey, scope)),
      );
      await db.query(
        "UPDATE integration_credentials SET encrypted_value=$1,updated_at=now() WHERE name='mercadopago'",
        [previous.encrypted_before],
      );
    } else
      await db.query(
        "DELETE FROM integration_credentials WHERE name='mercadopago'",
      );
    await db.query("DELETE FROM credential_history WHERE id=$1", [previous.id]);
  });
  await audit(pool, "admin", "payment.restored");
}
