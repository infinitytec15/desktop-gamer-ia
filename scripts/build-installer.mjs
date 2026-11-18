import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
const thumbprint = (process.env.GF_SIGNING_CERT_THUMBPRINT || "")
  .replace(/\s/g, "")
  .toUpperCase();
const { version } = JSON.parse(
  await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Versão do instalador inválida");
if (process.platform !== "win32")
  throw new Error("Gere o instalador Windows em uma máquina Windows");
if (thumbprint && !/^[A-F0-9]{40}$/.test(thumbprint))
  throw new Error("GF_SIGNING_CERT_THUMBPRINT inválido");
if (process.env.GF_REQUIRE_SIGNING === "true" && !thumbprint)
  throw new Error(
    "Assinatura obrigatória: configure um certificado Authenticode válido no Windows",
  );
const args = [
  "run",
  "tauri",
  "-w",
  "@gameforge/desktop",
  "--",
  "build",
  "--bundles",
  "nsis",
];
if (thumbprint) {
  const config = path.resolve("artifacts/signing.config.json");
  await mkdir(path.dirname(config), { recursive: true });
  await writeFile(
    config,
    JSON.stringify({
      bundle: {
        windows: {
          certificateThumbprint: thumbprint,
          digestAlgorithm: "sha256",
          timestampUrl: "http://timestamp.digicert.com",
          tsp: true,
        },
      },
    }),
  );
  args.push("--config", config);
} else
  console.log(
    "Beta sem assinatura Authenticode: UAC não substitui a reputação SmartScreen. Não desative a proteção do Windows.",
  );
const npmCli =
  process.env.npm_execpath ||
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
if (!existsSync(npmCli))
  throw new Error(
    "CLI npm indisponível. Execute npm run installer no ambiente de build.",
  );
const run = spawnSync(process.execPath, [npmCli, ...args], {
  stdio: "inherit",
  windowsHide: true,
});
if (run.status !== 0) process.exit(run.status || 1);
if (thumbprint) {
  const check = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$p=Get-ChildItem -LiteralPath 'target/release/bundle/nsis' -Filter '*_" +
        version +
        "_x64-setup.exe'; if($p.Count -ne 1){exit 2}; $s=Get-AuthenticodeSignature -LiteralPath $p.FullName; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Thumbprint -ne '" +
        thumbprint +
        "'){exit 3}; Write-Output 'Assinatura Authenticode válida'",
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (check.status !== 0)
    throw new Error(
      "A assinatura do instalador não foi validada. Não publique este pacote como assinado.",
    );
}
