import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
  verify,
} from "node:crypto";
import {
  passwordHash,
  passwordCheck,
  encrypt,
  decrypt,
  verifyWebhook,
  signedEnvelope,
  publicRaw,
} from "../src/security.js";
import { usageCost } from "../src/planner.js";
import { periodEnd } from "../src/billing.js";
import { margin } from "../src/credits.js";
test("passwords use a unique salt and reject invalid passwords", async () => {
  const a = await passwordHash("a-password-long-enough"),
    b = await passwordHash("a-password-long-enough");
  assert.notEqual(a, b);
  assert.equal(await passwordCheck("a-password-long-enough", a), true);
  assert.equal(await passwordCheck("wrong-password", a), false);
});
test("AES-GCM detects tampering and never returns the key in ciphertext", () => {
  const key = randomBytes(32),
    encrypted = encrypt("secret-provider-token", key);
  assert.equal(decrypt(encrypted, key), "secret-provider-token");
  assert.equal(encrypted.includes("secret-provider-token"), false);
  assert.throws(() => decrypt(encrypted.slice(0, -4) + "aaaa", key));
});
test("webhook signature binds lowercase query id, request and timestamp", () => {
  const ts = String(Date.now()),
    manifest = `id:abc123;request-id:request-1;ts:${ts};`,
    v1 = createHmac("sha256", "test-secret").update(manifest).digest("hex");
  const signature = `ts=${ts},v1=${v1}`;
  assert.equal(
    verifyWebhook("test-secret", signature, "request-1", "ABC123"),
    true,
  );
  assert.equal(
    verifyWebhook("test-secret", signature, "request-1", "other-id"),
    false,
  );
  assert.equal(
    verifyWebhook("test-secret", signature, "request-2", "ABC123"),
    false,
  );
  assert.equal(
    verifyWebhook(
      "test-secret",
      signature + ",ts=" + ts,
      "request-1",
      "ABC123",
    ),
    false,
  );
});
test("desktop envelope signs the encoded payload and exposes raw public key", () => {
  const keys = generateKeyPairSync("ed25519");
  const envelope = signedEnvelope({ device_id: "one" }, keys.privateKey);
  assert.equal(Buffer.from(publicRaw(keys.privateKey), "base64").length, 32);
  assert.equal(
    verify(
      null,
      Buffer.from(envelope.payload),
      keys.publicKey,
      Buffer.from(envelope.signature, "base64url"),
    ),
    true,
  );
  assert.equal(
    verify(
      null,
      Buffer.from(envelope.payload + "x"),
      keys.publicKey,
      Buffer.from(envelope.signature, "base64url"),
    ),
    false,
  );
});
test("usage credits account for output and cached input without reasoning duplication", () => {
  assert.equal(
    usageCost("anthropic", { input_tokens: 1000, output_tokens: 1000 }),
    24_000_000,
  );
  assert.equal(
    usageCost("openai", { input_tokens: 1000, output_tokens: 1000 }),
    12_000_000,
  );
  assert.equal(
    usageCost("openai", {
      input_tokens: 1000,
      output_tokens: 1000,
      input_tokens_details: { cached_tokens: 500 },
      output_tokens_details: { reasoning_tokens: 700 },
    }),
    11_050_000,
  );
  assert.throws(() =>
    usageCost("anthropic", { input_tokens: -1, output_tokens: 200 }),
  );
});
test("monthly period clamps month-end without skipping February", () => {
  assert.equal(
    periodEnd(new Date("2026-01-31T12:30:00Z"), 1).toISOString(),
    "2026-02-28T12:30:00.000Z",
  );
  assert.equal(
    periodEnd(new Date("2026-12-31T12:30:00Z"), 1).toISOString(),
    "2027-01-31T12:30:00.000Z",
  );
});
test("commercial assumptions preserve a contribution margin on discounted bundles", () => {
  assert.ok(
    margin(35990, 12000, { fx: 6.5, fee_pct: 6, reserve_pct: 10 }) > 60,
  );
  assert.ok(margin(1000, 12000, { fx: 6.5, fee_pct: 6, reserve_pct: 10 }) < 0);
});
