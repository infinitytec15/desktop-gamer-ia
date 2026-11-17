import { spawnSync } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
  throw new Error("Não foi possível ler a configuração do Railway");
const values = JSON.parse(result.stdout);
const privateKey = createPrivateKey(
  values.LICENSE_PRIVATE_KEY.replace(/\\n/g, "\n"),
);
const publicKey = createPublicKey(privateKey)
  .export({ type: "spki", format: "der" })
  .subarray(-32)
  .toString("base64");
await mkdir(new URL("../config/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../config/desktop-cloud.json", import.meta.url),
  JSON.stringify({ api_url: values.APP_URL, public_key: publicKey }, null, 2) +
    "\n",
);
console.log(
  "Destino público do instalador atualizado. Nenhum segredo foi gravado.",
);
