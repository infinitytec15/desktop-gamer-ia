import { Pool, type PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { Config } from "./config.js";
export function database(config: Config) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: Math.max(2, Math.min(50, Number(process.env.DB_POOL_MAX) || 12)),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  });
}
export async function transaction<T>(
  pool: Pool,
  fn: (db: PoolClient) => Promise<T>,
) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function migrate(pool: Pool, config: Config) {
  await transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(57369104)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL)",
    );
    for (const filename of [
      "001_initial.sql",
      "002_lookup_indexes.sql",
      "003_printing_jobs.sql",
      "004_integration_vault.sql",
      "005_manual_subscriptions.sql",
    ]) {
      const version = filename.split("_")[0];
      const sql = await readFile(
        fileURLToPath(new URL("../migrations/" + filename, import.meta.url)),
        "utf8",
      );
      const digest = createHash("sha256").update(sql).digest("hex");
      const existing = await db.query(
        "SELECT checksum FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (existing.rows.length && existing.rows[0].checksum !== digest)
        throw new Error("Migration " + version + " alterada após aplicação");
      if (!existing.rows.length) {
        await db.query(sql);
        await db.query("INSERT INTO schema_migrations VALUES($1,$2)", [
          version,
          digest,
        ]);
      }
    }
    for (const p of [
      { id: "core", name: "Core", price: 4990, devices: 1, credits: 1000 },
      {
        id: "creator",
        name: "Creator",
        price: 11990,
        devices: 3,
        credits: 3500,
      },
      { id: "studio", name: "Studio", price: 24990, devices: 5, credits: 9000 },
    ]) {
      await db.query(
        "INSERT INTO plans(id,name,price_cents,interval_months,max_devices,credits,features) VALUES($1,$2,$3,1,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
        [
          p.id,
          p.name,
          p.price,
          p.devices,
          p.credits,
          JSON.stringify(["system_optimize", "obs_configure", "ai_plans"]),
        ],
      );
    }
    for (const p of [
      { id: "credits_1000", name: "Recarga", credits: 1000, price: 3990 },
      { id: "credits_4000", name: "Reserva", credits: 4000, price: 13990 },
      { id: "credits_12000", name: "Power", credits: 12000, price: 35990 },
    ]) {
      await db.query(
        "INSERT INTO credit_packages VALUES($1,$2,$3,$4,true) ON CONFLICT DO NOTHING",
        [p.id, p.name, p.credits, p.price],
      );
    }
  });
}
export async function audit(
  pool: Pool,
  actor: string,
  event: string,
  metadata: Record<string, unknown> = {},
) {
  await pool.query(
    "INSERT INTO audit_log(actor,event,metadata) VALUES($1,$2,$3)",
    [actor, event, JSON.stringify(metadata)],
  );
}
