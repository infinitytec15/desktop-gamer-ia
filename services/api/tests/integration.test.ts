import {reconcileTopup} from '../src/topups.js';
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  createHmac,
} from "node:crypto";
import type { Server } from "node:http";
import { readConfig } from "../src/config.js";
import { database, migrate, transaction } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createLicense, activate, deviceAuth } from "../src/license.js";
import { grant, wallet, reserve, MICRO, settle } from "../src/credits.js";
import { reconcileInvoice } from "../src/billing.js";
import { generatePlan } from "../src/planner.js";
const enabled = !!process.env.TEST_DATABASE_URL;
const integration = enabled ? test : test.skip;
const privateKey = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const c = readConfig({
  DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://invalid",
  APP_URL: "http://127.0.0.1:18080",
  ADMIN_EMAIL: "admin@example.test",
  ADMIN_PASSWORD: "fixture-admin-password-123",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  LICENSE_PEPPER: randomBytes(32).toString("hex"),
  PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  LICENSE_PRIVATE_KEY: privateKey,
  MP_ACCESS_TOKEN: "fixture",
  MP_WEBHOOK_SECRET: "fixture-webhook",
  MP_COLLECTOR_ID: "123",
  BILLING_ENABLED: "true",
});
const pool = database(c);
let server: Server,
  origin = "";
const realFetch = globalThis.fetch;
before(async () => {
  if (!enabled) return;
  await migrate(pool, c);
  server = createApp(pool, c).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
after(async () => {
  globalThis.fetch = realFetch;
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});
async function user() {
  const id = randomUUID(),
    email = id + "@example.test";
  await pool.query(
    "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
    [id, email, "Fixture", "unused"],
  );
  return { id, email };
}
async function post(path: string, body: unknown, cookie?: string) {
  return realFetch(origin + "/api" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: c.appUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
integration(
  "auth rejects cross-origin mutation and user cannot reach admin",
  async () => {
    let response = await realFetch(origin + "/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://other.test",
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 403);
    const email = randomUUID() + "@example.test";
    response = await post("/auth/register", {
      email,
      password: "fixture-user-password",
      name: "Fixture",
    });
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    response = await realFetch(origin + "/api/admin/dashboard", {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 403);
    response = await post("/account/licenses", {}, cookie);
    assert.equal(response.status, 403);
    response = await post("/auth/admin", {
      email: c.adminEmail,
      password: c.adminPassword,
    });
    assert.equal(response.status, 200);
    const adminCookie = response.headers.get("set-cookie")!.split(";")[0];
    const dashboard = await realFetch(origin + "/api/admin/dashboard", {
      headers: { Cookie: adminCookie },
    });
    assert.equal(dashboard.status, 200);
const results=await realFetch(origin+'/api/admin/users?q='+encodeURIComponent(email)+'&offset=0',{headers:{Cookie:adminCookie}});assert.equal(results.status,200);assert.equal((await results.json()).length,1);
const invalid=await realFetch(origin+'/api/admin/users?offset=-1',{headers:{Cookie:adminCookie}});assert.equal(invalid.status,400);
  },
);
integration(
  "device limit is atomic across concurrent activations and keys are hashed",
  async () => {
    const u = await user();
    const key = await createLicense(
      pool,
      c,
      { userId: u.id, planId: "core", source: "manual", days: 5 },
      "fixture",
    );
    const stored = (
      await pool.query("SELECT key_hash FROM licenses WHERE id=$1", [key.id])
    ).rows[0];
    assert.equal(stored.key_hash.includes(key.key), false);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        activate(
          pool,
          c,
          key.key,
          "device-fingerprint-" + i.toString().padStart(6, "0"),
          "Fixture PC",
          "windows",
        ),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM devices WHERE license_id=$1",
          [key.id],
        )
      ).rows[0].n,
      1,
    );
    const success = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<any>;
    await pool.query("UPDATE licenses SET revoked_at=now() WHERE id=$1", [
      key.id,
    ]);
    await assert.rejects(() =>
      deviceAuth(pool, c, success.value.refresh_token),
    );
  },
);
integration("owner checks protect device revocation", async () => {
  const response = await post("/auth/register", {
    email: randomUUID() + "@example.test",
    password: "fixture-user-password",
    name: "Other",
  });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const u = await user(),
    key = await createLicense(
      pool,
      c,
      { userId: u.id, planId: "core", source: "manual", days: 5 },
      "fixture",
    );
  const device = await activate(
    pool,
    c,
    key.key,
    "owner-check-fingerprint",
    "Private PC",
    "windows",
  );
  const denied = await post(
    "/account/devices/" + device.device_id + "/revoke",
    {},
    cookie,
  );
  assert.equal(denied.status, 404);
  assert.ok(await deviceAuth(pool, c, device.refresh_token));
});
integration(
  "credits grant idempotently; concurrent reservations cannot overspend",
  async () => {
    const key = "fixture:" + randomUUID(),
      source = randomUUID();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        transaction(pool, (db) => grant(db, key, source, 5, true)),
      ),
    );
    assert.equal((await wallet(pool, key)).balance, 5);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        transaction(pool, (db) => reserve(db, key, MICRO, "fixture-" + i)),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal((await wallet(pool, key)).balance, 0);
    await transaction(pool, (db) => grant(db, key, source, 5, false));
    assert.equal((await wallet(pool, key)).balance, -5);
    await transaction(pool, (db) => grant(db, key, source, 5, false));
    assert.equal((await wallet(pool, key)).balance, -5);
  },
);
integration(
  "approved invoice grants one period and one credit lot; refund removes both",
  async () => {
    const u = await user(),
      id = randomUUID(),
      provider = randomUUID(),
      invoice = randomUUID(),
      payment = "p" + randomUUID();
    await pool.query(
      "INSERT INTO subscriptions(id,user_id,plan_id,status,amount_cents,credits,interval_months,provider_id) VALUES($1,$2,'core','authorized',4990,1000,1,$3)",
      [id, u.id, provider],
    );
    let refunded = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/authorized_payments/" + invoice))
        return Response.json({
          id: invoice,
          preapproval_id: provider,
          external_reference: id,
          payment: { id: payment },
          currency_id: "BRL",
          transaction_amount: 49.9,
          debit_date: new Date().toISOString(),
        });
      if (url.includes("/v1/payments/" + payment))
        return Response.json({
          id: payment,
          external_reference: id,
          collector_id: 123,
          live_mode: false,
          currency_id: "BRL",
          transaction_amount: 49.9,
          transaction_amount_refunded: refunded,
          status: refunded ? "refunded" : "approved",
          status_detail: "accredited",
          date_approved: new Date().toISOString(),
        });
      return realFetch(input, init);
    };
    try {
      await Promise.all([
        reconcileInvoice(pool, c, invoice),
        reconcileInvoice(pool, c, invoice),
      ]);
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 1000);
      assert.ok(
        (
          await pool.query("SELECT paid_until FROM subscriptions WHERE id=$1", [
            id,
          ])
        ).rows[0].paid_until,
      );
      const key = await createLicense(
        pool,
        c,
        { userId: u.id, planId: "core", source: "subscription" },
        u.id,
      );
      assert.ok(key.key);
      refunded = 49.9;
      await reconcileInvoice(pool, c, invoice);
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 0);
      assert.equal(
        (
          await pool.query("SELECT paid_until FROM subscriptions WHERE id=$1", [
            id,
          ])
        ).rows[0].paid_until,
        null,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  },
);
integration(
  "webhooks reject forged id and persist one retry delivery",
  async () => {
    const dataId = "webhook-test-" + randomUUID(),
      requestId = randomUUID(),
      ts = String(Date.now()),
      v1 = createHmac("sha256", c.mpWebhookSecret)
        .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
        .digest("hex");
    const send = (id: string) =>
      realFetch(origin + "/api/webhooks/mercadopago?data.id=" + id, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-signature": `ts=${ts},v1=${v1}`,
        },
        body: JSON.stringify({ type: "payment", data: { id: dataId } }),
      });
    assert.equal((await send("forged")).status, 401);
    assert.equal((await send(dataId)).status, 201);
    assert.equal((await send(dataId)).status, 201);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM webhook_events WHERE resource_id=$1",
          [dataId],
        )
      ).rows[0].n,
      1,
    );
  },
);
integration(
  "AI settles measured usage once and deduplicates a request",
  async () => {
    const u = await user(),
      key = await createLicense(
        pool,
        c,
        { userId: u.id, planId: "core", source: "manual", days: 5 },
        "fixture",
      );
    const a = await activate(
        pool,
        c,
        key.key,
        "planner-device-fingerprint",
        "AI Fixture",
        "windows",
      ),
      auth = await deviceAuth(pool, c, a.refresh_token);
    await transaction(pool, (db) =>
      grant(db, "user:" + u.id, "test-ai:" + u.id, 1000, true),
    );
    process.env.ANTHROPIC_API_KEY = "fixture-provider-key";
    process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input) === "https://api.anthropic.com/v1/messages") {
        calls++;
        return Response.json({
          usage: { input_tokens: 1000, output_tokens: 1000 },
          content: [
            {
              type: "tool_use",
              name: "submit_plan",
              input: {
                summary: "Fixture proposal",
                system_actions: ["enable_game_mode"],
                video: { width: 1280, height: 720, fps: 30, bitrate: 3500 },
              },
            },
          ],
        });
      }
      return realFetch(input, init);
    };
    const body = {
      request_id: randomUUID(),
      allow_fallback: false,
      context: {
        goal: "Prepare game",
        os: "Windows",
        architecture: "x86_64",
        cpu: "Fixture",
        cores: 8,
        ram_gb: 16,
        used_ram_gb: 8,
        cpu_usage: 20,
        disks: [{ total_gb: 500, free_gb: 100 }],
      },
    };
    try {
      await generatePlan(pool, c, auth.device, auth.license, body);
      await generatePlan(pool, c, auth.device, auth.license, body);
      assert.equal(calls, 1);
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 976);
      const row = (
        await pool.query("SELECT charged FROM ai_requests WHERE id=$1", [
          body.request_id,
        ])
      ).rows[0];
      assert.equal(Number(row.charged), 24 * MICRO);
      await settle(pool, body.request_id, "done", 0, null, {});
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 976);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.ANTHROPIC_API_KEY;
    }
  },
);

integration('topup grants once, validates merchant and reverses refunded credits',async()=>{const u=await user(),id=randomUUID(),preference='pref-'+randomUUID(),paymentId='pay-'+randomUUID();await pool.query("INSERT INTO credit_orders(id,user_id,package_id,credits,amount_cents,provider_id,status) VALUES($1,$2,'credits_4000',4000,13990,$3,'pending')",[id,u.id,preference]);let status='approved',collector=123;globalThis.fetch=async(input,init)=>{const url=String(input);if(url.includes('/v1/payments/'+paymentId))return Response.json({id:paymentId,external_reference:id,collector_id:collector,live_mode:false,currency_id:'BRL',transaction_amount:139.9,transaction_amount_refunded:status==='approved'?0:139.9,status,status_detail:'accredited',order:{id:'fixture-merchant'}});if(url.includes('/merchant_orders/fixture-merchant'))return Response.json({preference_id:preference,external_reference:id,payments:[{id:paymentId}]});return realFetch(input,init)};try{await Promise.all([reconcileTopup(pool,c,paymentId),reconcileTopup(pool,c,paymentId)]);assert.equal((await wallet(pool,'user:'+u.id)).balance,4000);collector=999;await assert.rejects(()=>reconcileTopup(pool,c,paymentId));assert.equal((await wallet(pool,'user:'+u.id)).balance,4000);collector=123;status='refunded';await reconcileTopup(pool,c,paymentId);assert.equal((await wallet(pool,'user:'+u.id)).balance,0)}finally{globalThis.fetch=realFetch}});
