import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const pair = generateKeyPairSync("ed25519");
const env = {
  DATABASE_URL:
    "postgresql://postgres:gameforge_test_only@127.0.0.1:55432/gameforge",
  APP_URL: "http://127.0.0.1:8080",
  ADMIN_EMAIL: "admin@example.test",
  ADMIN_PASSWORD: "fixture-admin-password-123",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  LICENSE_PEPPER: randomBytes(32).toString("hex"),
  PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  LICENSE_PRIVATE_KEY:
    '"' +
    pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim() +
    '"',
  WORKER_ENABLED: "false",
  BILLING_ENABLED: "false",
};
await writeFile(
  new URL("../../../.env.local", import.meta.url),
  Object.entries(env)
    .map(([k, v]) => k + "=" + v)
    .join("\n"),
);
console.log(
  "Ambiente local de testes preparado em .env.local (ignorado pelo Git).",
);
