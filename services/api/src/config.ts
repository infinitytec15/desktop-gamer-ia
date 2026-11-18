import { createPrivateKey } from "node:crypto";
import { z } from "zod";
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const schema = z.object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.url(),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(16).max(200),
    SESSION_SECRET: z.string().min(32),
    LICENSE_PEPPER: z.string().min(32),
    PROVIDER_ENCRYPTION_KEY: z.string().min(40),
    LICENSE_PRIVATE_KEY: z.string().min(40),
  });
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      "Variáveis ausentes ou inválidas: " +
        result.error.issues.map((i) => i.path[0]).join(", "),
    );
  const e = result.data;
  const app = new URL(e.APP_URL);
  if (
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    !["", "/"].includes(app.pathname)
  )
    throw new Error("APP_URL deve conter apenas a origem do site");
  const production = env.NODE_ENV === "production";
  if (production && app.protocol !== "https:")
    throw new Error("APP_URL precisa usar HTTPS em produção");
  const privateKey = createPrivateKey(
    e.LICENSE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  );
  if (privateKey.asymmetricKeyType !== "ed25519")
    throw new Error("LICENSE_PRIVATE_KEY deve ser Ed25519");
  const encryptionKey = Buffer.from(e.PROVIDER_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32)
    throw new Error("PROVIDER_ENCRYPTION_KEY deve conter 32 bytes em base64");
  return {
    databaseUrl: e.DATABASE_URL,
    appUrl: app.origin,
    production,
    adminEmail: e.ADMIN_EMAIL.toLowerCase(),
    adminPassword: e.ADMIN_PASSWORD,
    sessionSecret: e.SESSION_SECRET,
    licensePepper: e.LICENSE_PEPPER,
    encryptionKey,
    privateKey,
    port: Number(env.PORT || 8080),
    databaseSsl: env.DATABASE_SSL === "true",
    mpToken: env.MP_ACCESS_TOKEN || "",
    mpWebhookSecret: env.MP_WEBHOOK_SECRET || "",
    mpCollectorId: env.MP_COLLECTOR_ID || "",
    mpLiveMode: env.MP_LIVE_MODE === "true",
    billingEnabled: env.BILLING_ENABLED === "true",
    mpCancelStatus: env.MP_CANCEL_STATUS || "cancelled",
    downloadUrl: env.DESKTOP_DOWNLOAD_URL || "",
    macDownloadUrl: env.DESKTOP_MAC_DOWNLOAD_URL || "",
    workerEnabled: env.WORKER_ENABLED !== "false",
  };
}
export type Config = ReturnType<typeof readConfig>;
