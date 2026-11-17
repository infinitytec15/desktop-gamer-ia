import type { Pool, PoolClient } from "pg";
import { transaction } from "./db.js";
import { HttpError } from "./errors.js";
export const MICRO = 1_000_000; // 1 crédito = US$ 0,001 de uso Standard; saldo em microcréditos.
export async function move(
  db: PoolClient,
  key: string,
  delta: number,
  reason: string,
  reference: string,
) {
  if (!Number.isSafeInteger(delta)) throw new Error("Movimento inválido");
  await db.query("INSERT INTO wallets(key) VALUES($1) ON CONFLICT DO NOTHING", [
    key,
  ]);
  await db.query("UPDATE wallets SET balance=balance+$2 WHERE key=$1", [
    key,
    delta,
  ]);
  await db.query(
    "INSERT INTO credit_ledger(wallet_key,delta,reason,reference) VALUES($1,$2,$3,$4)",
    [key, delta, reason, reference],
  );
}
export async function grant(
  db: PoolClient,
  key: string,
  source: string,
  credits: number,
  active: boolean,
) {
  await db.query("INSERT INTO wallets(key) VALUES($1) ON CONFLICT DO NOTHING", [
    key,
  ]);
  await db.query("SELECT key FROM wallets WHERE key=$1 FOR UPDATE", [key]);
  const old = (
    await db.query("SELECT * FROM credit_grants WHERE source=$1 FOR UPDATE", [
      source,
    ])
  ).rows[0];
  const amount = credits * MICRO;
  if (old && old.wallet_key !== key) throw new Error("Carteira divergente");
  if (!old) {
    await db.query("INSERT INTO credit_grants VALUES($1,$2,$3,$4)", [
      source,
      key,
      amount,
      active,
    ]);
    if (active) await move(db, key, amount, "payment", source);
  } else if (old.active !== active) {
    await db.query("UPDATE credit_grants SET active=$2 WHERE source=$1", [
      source,
      active,
    ]);
    await move(
      db,
      key,
      active ? Number(old.amount) : -Number(old.amount),
      active ? "payment" : "reversal",
      source,
    );
  }
}
export async function wallet(pool: Pool, key: string) {
  const row = (
    await pool.query("SELECT balance FROM wallets WHERE key=$1", [key])
  ).rows[0];
  const ledger = (
    await pool.query(
      "SELECT delta,reason,reference,created_at FROM credit_ledger WHERE wallet_key=$1 ORDER BY id DESC LIMIT 50",
      [key],
    )
  ).rows;
  return {
    balance: Number(row?.balance || 0) / MICRO,
    ledger: ledger.map((v) => ({ ...v, delta: Number(v.delta) / MICRO })),
  };
}
export async function reserve(
  db: PoolClient,
  key: string,
  amount: number,
  requestId: string,
) {
  await db.query("INSERT INTO wallets(key) VALUES($1) ON CONFLICT DO NOTHING", [
    key,
  ]);
  const result = await db.query(
    "UPDATE wallets SET balance=balance-$2 WHERE key=$1 AND balance>=$2 RETURNING key",
    [key, amount],
  );
  if (!result.rows.length)
    throw new HttpError(
      402,
      "Saldo insuficiente para reservar esta análise. Compre créditos no painel.",
    );
  await db.query(
    "INSERT INTO credit_ledger(wallet_key,delta,reason,reference) VALUES($1,$2,$3,$4)",
    [key, -amount, "reservation", requestId],
  );
}
export async function settle(
  pool: Pool,
  requestId: string,
  status: "done" | "failed",
  charged: number,
  result: unknown,
  usage: unknown,
) {
  await transaction(pool, async (db) => {
    const row = (
      await db.query("SELECT * FROM ai_requests WHERE id=$1 FOR UPDATE", [
        requestId,
      ])
    ).rows[0];
    if (!row || row.status !== "running") return;
    await move(
      db,
      row.wallet_key,
      Number(row.reserved) - charged,
      "settlement",
      requestId,
    );
    await db.query(
      "UPDATE ai_requests SET status=$2,charged=$3,result=$4,usage=$5 WHERE id=$1",
      [
        requestId,
        status,
        charged,
        result ? JSON.stringify(result) : null,
        JSON.stringify(usage),
      ],
    );
  });
}
export async function recoverStale(pool: Pool) {
  const rows = (
    await pool.query(
      "SELECT id,reserved FROM ai_requests WHERE status='running' AND created_at<now()-interval '15 minutes' LIMIT 50",
    )
  ).rows;
  for (const row of rows)
    await settle(pool, row.id, "failed", Number(row.reserved), null, {
      interrupted: true,
      policy:
        "Reserva mantida: consumo externo inconclusivo. Admin pode ajustar após conferir o provedor.",
    });
}
export async function commercial(pool: Pool) {
  const row = (
    await pool.query("SELECT * FROM commercial_settings WHERE id=true")
  ).rows[0];
  return {
    fx: Number(row.fx),
    fee_pct: Number(row.fee_pct),
    reserve_pct: Number(row.reserve_pct),
    min_margin_pct: Number(row.min_margin_pct),
  };
}
export function margin(
  price: number,
  credits: number,
  settings: { fx: number; fee_pct: number; reserve_pct: number },
) {
  return (
    100 -
    settings.fee_pct -
    settings.reserve_pct -
    ((credits * 0.001 * settings.fx) / (price / 100)) * 100
  );
}
export async function assertMargin(pool: Pool, price: number, credits: number) {
  const s = await commercial(pool);
  if (margin(price, credits, s) < s.min_margin_pct)
    throw new HttpError(
      400,
      "Preço e créditos ficam abaixo da margem mínima configurada. Ajuste o catálogo ou a política comercial.",
    );
}
