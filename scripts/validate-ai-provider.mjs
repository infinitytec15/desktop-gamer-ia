// Reads admin credentials privately from Railway; never prints keys or cookies.
// Without --run it only checks readiness. --run performs one paid provider test.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const args = process.argv.slice(2);
const provider =
  args.find((arg) => arg !== "--run" && arg !== "--models") || "openai";
assert.ok(
  ["openai", "anthropic"].includes(provider),
  "Use openai ou anthropic",
);
assert.ok(
  args.every((arg) =>
    ["--run", "--models", "openai", "anthropic"].includes(arg),
  ),
  "Argumento desconhecido",
);
const envResult = spawnSync(
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
if (envResult.status !== 0)
  throw new Error("Não foi possível acessar o ambiente Railway");
const env = JSON.parse(envResult.stdout);
const base = env.APP_URL;
assert.equal(new URL(base).protocol, "https:");
async function call(path, body, cookie) {
  const r = await fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(80000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("Falha de verificação: HTTP " + r.status);
  return r;
}
const login = await call("/auth/admin", {
  email: env.ADMIN_EMAIL,
  password: env.ADMIN_PASSWORD,
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
try {
  const config = await (await call("/admin/config", undefined, cookie)).json();
  const state = config.providers.find((p) => p.provider === provider);
  const configured = !!(state?.configured || state?.environment);
  console.log(
    JSON.stringify({
      provider,
      model: config.models[provider],
      configured,
      last_test: state?.last_test || null,
    }),
  );
  if (args.includes("--models")) {
    console.log(
      JSON.stringify(
        await (
          await call("/admin/providers/" + provider + "/models", {}, cookie)
        ).json(),
      ),
    );
  }
  if (args.includes("--run")) {
    assert.ok(configured, "Cadastre a chave no painel admin antes de executar");
    const result = await (
      await call("/admin/providers/" + provider + "/test", {}, cookie)
    ).json();
    console.log(JSON.stringify(result));
    if (!result.success) process.exitCode = 1;
  }
} finally {
  await call("/auth/logout", {}, cookie);
}
