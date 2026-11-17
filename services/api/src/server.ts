import { recoverStale } from "./credits.js";
import { readConfig } from "./config.js";
import { database, migrate } from "./db.js";
import { createApp } from "./app.js";
import { workInbox, reconcileSubscription } from "./billing.js";
const config = readConfig(),
  pool = database(config);
await migrate(pool, config);
const server = createApp(pool, config).listen(config.port, "0.0.0.0", () =>
  console.log("GameForge API pronta na porta " + config.port),
);
let busy = false,
  ticks = 0;
const timer = setInterval(async () => {
  if (busy || !config.workerEnabled) return;
  busy = true;
  try {
    await workInbox(pool, config);
    if (ticks % 12 === 0) await recoverStale(pool);
    if (++ticks % 720 === 0) {
      const rows = (
        await pool.query(
          "SELECT provider_id FROM subscriptions WHERE provider_id IS NOT NULL AND (status IN ('pending','authorized','active','paused') OR updated_at>now()-interval '30 days') ORDER BY updated_at LIMIT 1000",
        )
      ).rows;
      for (const row of rows) {
        try {
          await reconcileSubscription(pool, config, row.provider_id);
        } catch {
          console.error(
            "Reconciliação pendente; confira o painel de assinaturas",
          );
        }
      }
      await pool.query(
        "DELETE FROM sessions WHERE expires_at<now(); DELETE FROM rate_limits WHERE expires_at<now(); DELETE FROM ai_requests WHERE created_at<now()-interval '90 days'",
      );
    }
  } catch {
    console.error("Worker indisponível; retomará no próximo ciclo");
  } finally {
    busy = false;
  }
}, 5000);
timer.unref();
async function shutdown() {
  clearInterval(timer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
