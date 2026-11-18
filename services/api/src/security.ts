import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
  createCipheriv,
  createDecipheriv,
  sign,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
export function secretToken() {
  return randomBytes(32).toString("base64url");
}
export function hashToken(token: string, pepper: string) {
  return createHmac("sha256", pepper).update(token).digest("hex");
}
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16);
  return (
    "scrypt$" +
    salt.toString("hex") +
    "$" +
    (await derive(password, salt)).toString("hex")
  );
}
export async function passwordCheck(password: string, hash: string) {
  const [type, salt, expected] = hash.split("$");
  if (type !== "scrypt" || !salt || !expected) return false;
  return constantEqual(
    (await derive(password, Buffer.from(salt, "hex"))).toString("hex"),
    expected,
  );
}
export function encrypt(secret: string, key: Buffer, scope?: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  if (scope) cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return (
    (scope ? "v2." : "") +
    [
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      encrypted.toString("base64"),
    ].join(".")
  );
}
export function decrypt(value: string, key: Buffer, scope?: string) {
  const bound = value.startsWith("v2.");
  if (bound && !scope) throw new Error("Escopo do segredo ausente");
  if (bound) value = value.slice(3);
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  if (bound) decipher.setAAD(Buffer.from(scope!));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
export function publicRaw(key: KeyObject) {
  return (
    createPublicKey(key).export({ type: "spki", format: "der" }) as Buffer
  )
    .subarray(-32)
    .toString("base64");
}
export function signedEnvelope(
  claims: Record<string, unknown>,
  key: KeyObject,
) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64url"),
  };
}
export function verifyWebhook(
  secret: string,
  signature: string,
  requestId: string,
  dataId: string,
) {
  const parts = signature.split(",").map((p) => p.trim().split("="));
  if (
    parts.filter((p) => p[0] === "ts").length !== 1 ||
    parts.filter((p) => p[0] === "v1").length !== 1
  )
    return false;
  const ts = parts.find((p) => p[0] === "ts")?.[1] || "",
    v1 = parts.find((p) => p[0] === "v1")?.[1] || "";
  if (
    !/^\d{10,16}$/.test(ts) ||
    !/^([a-f0-9]{64})$/i.test(v1) ||
    !requestId ||
    !dataId
  )
    return false;
  const stamp = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs(Date.now() - stamp) > 7 * 86400000) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return constantEqual(
    createHmac("sha256", secret).update(manifest).digest("hex"),
    v1.toLowerCase(),
  );
}
