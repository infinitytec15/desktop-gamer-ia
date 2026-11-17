import { generateKeyPairSync, randomBytes } from "node:crypto";
const pair = generateKeyPairSync("ed25519");
const values = {
  SESSION_SECRET: randomBytes(48).toString("base64url"),
  LICENSE_PEPPER: randomBytes(48).toString("base64url"),
  PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  LICENSE_PRIVATE_KEY: pair.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString()
    .replaceAll("\n", "\\n"),
  GAMEFORGE_LICENSE_PUBLIC_KEY_B64: pair.publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32)
    .toString("base64"),
  ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
};
// Execute conscientemente: stdout contém segredos para importar no Railway, nunca versionar.
for (const [key, value] of Object.entries(values))
  console.log(key + "=" + value);
