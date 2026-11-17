import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const result = spawnSync(
  "railway",
  [
    "variable",
    "list",
    "--service",
    "gameforge-web",
    "--project",
    "2a746c39-c8df-4688-bc9b-604b0c09c5b1",
    "--environment",
    "production",
    "--json",
  ],
  {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    maxBuffer: 2e6,
  },
);
if (result.status !== 0)
  throw new Error("Não foi possível carregar o ambiente para verificação");
const env = JSON.parse(result.stdout),
  base = env.APP_URL;
const local = JSON.parse(
  await readFile(
    new URL("../config/desktop-cloud.json", import.meta.url),
    "utf8",
  ),
);
async function get(path, headers) {
  const r = await fetch(base + path, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(r.status, 200, "HTTP " + path);
  return r.json();
}
assert.equal((await get("/api/health")).status, "ok");
const catalog = await get("/api/public");
assert.equal(catalog.plans.length, 3);
assert.equal(catalog.download_available, true);
assert.equal(catalog.billing_enabled, false);
const login = await fetch(base + "/api/auth/admin", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  }),
  signal: AbortSignal.timeout(15000),
});
assert.equal(login.status, 200, "Login administrativo");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const headers = { Cookie: cookie };
const config = await get("/api/admin/config", headers);
assert.equal(config.public_key, local.public_key);
assert.equal(config.app_url, local.api_url);
const dashboard = await get("/api/admin/dashboard", headers);
await fetch(base + "/api/auth/logout", {
  method: "POST",
  headers: { ...headers, Origin: base, "Content-Type": "application/json" },
  body: "{}",
});
// Burst de leitura: não é certificação de carga sustentada nem realiza cobrança.
const timings = [];
let completed = 0;
await Promise.all(
  Array.from({ length: 10 }, async () => {
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await get("/api/public");
      timings.push(performance.now() - start);
      completed++;
    }
  }),
);
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      health: "ok",
      plans: catalog.plans.map((p) => p.name),
      download: true,
      billing: false,
      admin: "ok",
      desktop_trust: "matched",
      accounts: dashboard.stats.users,
      read_requests: completed,
      concurrency: 10,
      p95_ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
    },
    null,
    2,
  ),
);
