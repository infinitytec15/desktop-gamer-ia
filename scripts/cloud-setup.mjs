// Provisiona somente variáveis do serviço já criado e selecionado. Não imprime segredos.
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
function railway(args, input) {
  const result = spawnSync("railway", args, {
    input,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    maxBuffer: 2e6,
  });
  if (result.status !== 0)
    throw new Error(
      "Railway recusou " + args[0] + ": " + result.stderr.slice(0, 200),
    );
  return result.stdout;
}
const service = "gameforge-web",
  project = "2a746c39-c8df-4688-bc9b-604b0c09c5b1";
const args = [
  "--service",
  service,
  "--project",
  project,
  "--environment",
  "production",
];
const existing = JSON.parse(railway(["variable", "list", ...args, "--json"]));
const domain = JSON.parse(railway(["domain", "list", ...args, "--json"]));
function firstDomain(value) {
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = firstDomain(v);
      if (r) return r;
    }
  } else if (value && typeof value === "object") {
    if (
      typeof value.domain === "string" &&
      value.domain.endsWith(".up.railway.app")
    )
      return value.domain;
    for (const v of Object.values(value)) {
      const r = firstDomain(v);
      if (r) return r;
    }
  }
  return null;
}
const host = firstDomain(domain);
if (!host) throw new Error("Crie o domínio do serviço antes de configurar");
const pair = generateKeyPairSync("ed25519");
const values = {
  NODE_ENV: "production",
  PORT: "8080",
  APP_URL: "https://" + host,
  DATABASE_URL: "${{Postgres.DATABASE_URL}}",
  DATABASE_SSL: "false",
  DB_POOL_MAX: "12",
  ADMIN_EMAIL: "admin@gameforge.local",
  ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  SESSION_SECRET: randomBytes(48).toString("base64url"),
  LICENSE_PEPPER: randomBytes(48).toString("base64url"),
  PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  LICENSE_PRIVATE_KEY: pair.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString()
    .replaceAll("\n", "\\n"),
  BILLING_ENABLED: "false",
  MP_ACCESS_TOKEN: "",
  MP_WEBHOOK_SECRET: "",
  MP_COLLECTOR_ID: "",
  MP_LIVE_MODE: "true",
  MP_CANCEL_STATUS: "cancelled",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  ANTHROPIC_MODEL: "claude-opus-5-5",
  OPENAI_MODEL: "gpt-6.1-sol",
  WORKER_ENABLED: "true",
  DESKTOP_DOWNLOAD_URL: "",
};
for (const [key, value] of Object.entries(values)) {
  if (Object.hasOwn(existing, key)) continue;
  value === ""
    ? railway(["variable", "set", key + "=", ...args, "--skip-deploys"])
    : railway(
        ["variable", "set", key, ...args, "--stdin", "--skip-deploys"],
        value,
      );
  console.log("Configurada: " + key);
}
console.log(
  "Segredos internos gerados sem exibição. Configure ADMIN_EMAIL/ADMIN_PASSWORD e as integrações no Railway.",
);
