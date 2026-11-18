import { reconcileTopup, topupCheckout } from "../src/topups.js";
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
import { reconcileInvoice, checkout } from "../src/billing.js";
import { generatePlan, runStructured, systemTask } from "../src/planner.js";
import { estimate } from "../src/estimates.js";
import { paymentConfig } from "../src/integrations.js";
import { decrypt } from "../src/security.js";
import { generatePrinting, accountActor } from "../src/printing.js";
import { briefSchema, localPlan } from "@gameforge/printing";
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
    const results = await realFetch(
      origin + "/api/admin/users?q=" + encodeURIComponent(email) + "&offset=0",
      { headers: { Cookie: adminCookie } },
    );
    assert.equal(results.status, 200);
    assert.equal((await results.json()).length, 1);
    const invalid = await realFetch(origin + "/api/admin/users?offset=-1", {
      headers: { Cookie: adminCookie },
    });
    assert.equal(invalid.status, 400);
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

integration(
  "topup grants once, validates merchant and reverses refunded credits",
  async () => {
    const u = await user(),
      id = randomUUID(),
      preference = "pref-" + randomUUID(),
      paymentId = "pay-" + randomUUID();
    await pool.query(
      "INSERT INTO credit_orders(id,user_id,package_id,credits,amount_cents,provider_id,status) VALUES($1,$2,'credits_4000',4000,13990,$3,'pending')",
      [id, u.id, preference],
    );
    await pool.query("UPDATE credit_orders SET provider_id=NULL WHERE id=$1", [
      id,
    ]);
    let status = "approved",
      collector = 123;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/v1/payments/" + paymentId))
        return Response.json({
          id: paymentId,
          external_reference: id,
          collector_id: collector,
          live_mode: false,
          currency_id: "BRL",
          transaction_amount: 139.9,
          transaction_amount_refunded: status === "approved" ? 0 : 139.9,
          status,
          status_detail: "accredited",
          order: { id: "fixture-merchant" },
        });
      if (url.includes("/merchant_orders/fixture-merchant"))
        return Response.json({
          preference_id: preference,
          external_reference: id,
          payments: [{ id: paymentId }],
        });
      return realFetch(input, init);
    };
    try {
      await Promise.all([
        reconcileTopup(pool, c, paymentId),
        reconcileTopup(pool, c, paymentId),
      ]);
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 4000);
      assert.equal(
        (
          await pool.query(
            "SELECT provider_id FROM credit_orders WHERE id=$1",
            [id],
          )
        ).rows[0].provider_id,
        preference,
      );
      collector = 999;
      await assert.rejects(() => reconcileTopup(pool, c, paymentId));
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 4000);
      collector = 123;
      status = "refunded";
      await reconcileTopup(pool, c, paymentId);
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  },
);

integration(
  "checkout deterministic failures allow retry and paused subscriptions block another contract",
  async () => {
    const u = await user();
    globalThis.fetch = async (input, init) => {
      if (String(input).includes("api.mercadopago.com"))
        return Response.json({ error: "fixture" }, { status: 400 });
      return realFetch(input, init);
    };
    try {
      await assert.rejects(() => topupCheckout(pool, c, u.id, "credits_1000"));
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM credit_orders WHERE user_id=$1",
            [u.id],
          )
        ).rows[0].status,
        "failed",
      );
      await pool.query(
        "INSERT INTO subscriptions(id,user_id,plan_id,status,amount_cents,credits,interval_months) VALUES($1,$2,'core','paused',4990,1000,1)",
        [randomUUID(), u.id],
      );
      await assert.rejects(() => checkout(pool, c, u.id, "core"), /Já existe/);
    } finally {
      globalThis.fetch = realFetch;
    }
  },
);

integration(
  "printing uses the same wallet, validates constraints, deduplicates by input and rejects unpaid access",
  async () => {
    const u = await user();
    await assert.rejects(() => accountActor(pool, u.id));
    await createLicense(
      pool,
      c,
      { userId: u.id, planId: "core", source: "manual", days: 5 },
      "fixture",
    );
    await transaction(pool, (db) =>
      grant(db, "user:" + u.id, "printing-fixture:" + u.id, 500, true),
    );
    const actor = await accountActor(pool, u.id);
    const brief = briefSchema.parse({
      technology: "fdm",
      slicer: "bambu",
      printer: "Fixture printer",
      material: "PLA",
      goal: "quality",
      problem: "none",
      notes: "",
      build_volume: [220, 220, 250],
      limits_confirmed: true,
      nozzle: 0.4,
      line_width: 0.45,
      max_nozzle: 260,
      max_bed: 80,
      material_min: 190,
      material_max: 230,
      max_flow: 8,
      current: {
        layer_height: 0.2,
        nozzle_temperature: 210,
        bed_temperature: 60,
        outer_speed: 45,
        inner_speed: 65,
        first_layer_speed: 20,
        walls: 2,
        infill: 15,
        fan: 100,
        supports: true,
        brim: 0,
      },
    });
    const p = localPlan(brief);
    let calls = 0,
      unsafe = false;
    process.env.ANTHROPIC_API_KEY = "fixture-printing-provider-key";
    process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
    globalThis.fetch = async (input, init) => {
      if (String(input) === "https://api.anthropic.com/v1/messages") {
        calls++;
        const sent = JSON.parse(String(init?.body));
        assert.equal(sent.tools[0].name, "submit_plan");
        assert.equal(
          sent.tool_choice.type,
          "auto",
          "Opus 5.5 does not support forced tools",
        );
        assert.ok(!JSON.stringify(sent).includes("STL_BINARY_CONTENT"));
        return Response.json({
          usage: { input_tokens: 1000, output_tokens: 1000 },
          content: [
            {
              type: "tool_use",
              name: "submit_plan",
              input: {
                summary: p.summary,
                rationale: p.rationale,
                calibration: p.calibration,
                fdm: {
                  ...p.fdm,
                  ...(unsafe ? { nozzle_temperature: 400 } : {}),
                },
                resin: null,
              },
            },
          ],
        });
      }
      return realFetch(input, init);
    };
    const input = {
      request_id: randomUUID(),
      allow_fallback: false,
      brief,
      geometry: null,
    };
    try {
      const plan = await generatePrinting(pool, c, actor, input);
      assert.equal(plan.source, "anthropic");
      await generatePrinting(pool, c, actor, input);
      assert.equal(calls, 1);
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 476);
      await assert.rejects(
        () =>
          generatePrinting(pool, c, actor, {
            ...input,
            brief: { ...brief, notes: "different input" },
          }),
        /Identificador/,
      );
      unsafe = true;
      await assert.rejects(
        () =>
          generatePrinting(pool, c, actor, {
            ...input,
            request_id: randomUUID(),
          }),
        /não entregou/,
      );
      assert.equal((await wallet(pool, "user:" + u.id)).balance, 452);
      const denied = await post("/account/printing/ai", input);
      assert.equal(denied.status, 401);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.ANTHROPIC_API_KEY;
    }
  },
);

integration(
  "admin provider test validates OpenAI, sanitizes failures and never debits customer wallets",
  async () => {
    assert.equal((await post("/admin/providers/openai/test", {})).status, 403);
    const login = await post("/auth/admin", {
      email: c.adminEmail,
      password: c.adminPassword,
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const before = (
      await pool.query("SELECT count(*)::int n FROM credit_ledger")
    ).rows[0].n;
    process.env.OPENAI_API_KEY = "fixture-provider-test-key";
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input) === "https://api.openai.com/v1/responses") {
        calls++;
        const sent = JSON.parse(String(init?.body));
        assert.equal(sent.model, "gpt-6.1-sol");
        assert.equal(sent.store, false);
        assert.equal(sent.service_tier, "default");
        assert.equal(sent.reasoning.effort, "low");
        if (calls === 2)
          return Response.json(
            {
              error: {
                message: "fixture-provider-test-key should never be exposed",
              },
            },
            { status: 401 },
          );
        if (calls === 3) throw new Error("fixture transport failure");
        return Response.json({
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            input_tokens_details: { cached_tokens: 20 },
          },
          output: [
            {
              type: "function_call",
              name: "submit_plan",
              arguments: JSON.stringify({
                summary: "Integration check",
                system_actions: [],
                video: { width: 1280, height: 720, fps: 30, bitrate: 3500 },
              }),
            },
          ],
        });
      }
      return realFetch(input, init);
    };
    try {
      const first = await (
        await post("/admin/providers/openai/test", {}, cookie)
      ).json();
      assert.equal(first.success, true);
      assert.equal(first.billable_credits, 0.562);
      assert.equal(first.customer_wallet_debited, false);
      const second = await (
        await post("/admin/providers/openai/test", {}, cookie)
      ).json();
      assert.equal(second.success, false);
      assert.match(second.error, /HTTP 401/);
      assert.ok(!JSON.stringify(second).includes("fixture-provider-test-key"));
      const third = await (
        await post("/admin/providers/openai/test", {}, cookie)
      ).json();
      assert.equal(third.success, false);
      assert.equal(third.inconclusive, true);
      assert.ok(third.billable_credits > 0);
      assert.equal(
        (await post("/admin/providers/openai/test", {}, cookie)).status,
        429,
      );
      assert.equal(calls, 3);
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM credit_ledger")).rows[0]
          .n,
        before,
      );
      const audit = (
        await pool.query(
          "SELECT metadata FROM audit_log WHERE event='provider.tested' ORDER BY id DESC LIMIT 3",
        )
      ).rows;
      assert.equal(audit.length, 3);
      assert.ok(!JSON.stringify(audit).includes("fixture-provider-test-key"));
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.OPENAI_API_KEY;
    }
  },
);

integration(
  "routing quotes grow with effort, enforce consent hash and settle the selected model cost",
  async () => {
    const input = {
      goal: "Integration routing check",
      os: "Fixture",
      architecture: "x86_64",
      cpu: "Fixture",
      cores: 8,
      ram_gb: 16,
      used_ram_gb: 4,
      cpu_usage: 15,
      disks: [],
    };
    process.env.OPENAI_API_KEY = "fixture-router-key";
    process.env.ANTHROPIC_API_KEY = "fixture-router-key";
    const body = {
      task: "system",
      context: input,
      mode: "economy",
      effort: "low",
      allow_fallback: true,
    };
    const low = await estimate(pool, body),
      high = await estimate(pool, { ...body, effort: "high" }),
      advanced = await estimate(pool, { ...body, mode: "advanced" });
    assert.ok(high.maximum_credits > low.maximum_credits);
    assert.ok(advanced.maximum_credits > low.maximum_credits);
    assert.equal(low.models[0], "gpt-6-luna");
    const actor = {
      deviceId: null,
      licenseId: null,
      walletKey: "fixture:router:" + randomUUID(),
    };
    await transaction(pool, (db) =>
      grant(db, actor.walletKey, "router-test:" + actor.walletKey, 1000, true),
    );
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input) === "https://api.openai.com/v1/responses") {
        calls++;
        const sent = JSON.parse(String(init?.body));
        assert.equal(sent.model, "gpt-6-luna");
        assert.equal(sent.reasoning.effort, "low");
        return Response.json({
          usage: { input_tokens: 1000, output_tokens: 1000 },
          output: [
            {
              type: "function_call",
              name: "submit_plan",
              arguments: JSON.stringify({
                summary: "Budget check",
                system_actions: [],
                video: { width: 1280, height: 720, fps: 30, bitrate: 3500 },
              }),
            },
          ],
        });
      }
      return realFetch(input, init);
    };
    try {
      await assert.rejects(
        () =>
          runStructured(pool, c, actor, randomUUID(), true, input, systemTask, {
            mode: "economy",
            effort: "high",
            quote_hash: low.quote_hash,
          }),
        /estimativa mudou/,
      );
      assert.equal(calls, 0);
      assert.equal((await wallet(pool, actor.walletKey)).balance, 1000);
      const id = randomUUID(),
        options = {
          mode: "economy" as const,
          effort: "low" as const,
          quote_hash: low.quote_hash,
        };
      await runStructured(pool, c, actor, id, true, input, systemTask, options);
      await runStructured(pool, c, actor, id, true, input, systemTask, options);
      assert.equal(calls, 1);
      assert.equal((await wallet(pool, actor.walletKey)).balance, 999.4);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
    }
  },
);

integration(
  "payment vault is write-only, context-bound and restores its encrypted snapshot",
  async () => {
    const login = await post("/auth/admin", {
      email: c.adminEmail,
      password: c.adminPassword,
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const key = "fixture-mp-token-secret-123456",
      secret = "fixture-mp-webhook-secret-123456";
    assert.equal((await post("/admin/mercadopago", {})).status, 403);
    const cross = await realFetch(origin + "/api/admin/mercadopago", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: key }),
    });
    assert.equal(cross.status, 403);
    let response = await post(
      "/admin/mercadopago",
      {
        access_token: key,
        webhook_secret: secret,
        collector_id: "123",
        billing_enabled: false,
        live_mode: false,
      },
      cookie,
    );
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.ok(!JSON.stringify(status).includes(key));
    assert.ok(!JSON.stringify(status).includes(secret));
    assert.equal(status.token, true);
    assert.match(status.webhook_url, /webhooks\/mercadopago$/);
    const stored = (
      await pool.query(
        "SELECT encrypted_value FROM integration_credentials WHERE name='mercadopago'",
      )
    ).rows[0].encrypted_value;
    assert.ok(stored.startsWith("v2."));
    assert.ok(!stored.includes(key));
    assert.throws(() => decrypt(stored, c.encryptionKey, "provider:openai"));
    assert.equal((await paymentConfig(pool, c)).mpToken, key);
    await post(
      "/admin/mercadopago",
      { access_token: key + "-changed", billing_enabled: false },
      cookie,
    );
    await post("/admin/mercadopago/restore", {}, cookie);
    assert.equal((await paymentConfig(pool, c)).mpToken, key);
    await post("/admin/mercadopago/restore", {}, cookie);
    assert.equal((await paymentConfig(pool, c)).mpToken, c.mpToken);
    const audit = (
      await pool.query(
        "SELECT metadata FROM audit_log WHERE event='payment.configured' ORDER BY id DESC LIMIT 2",
      )
    ).rows;
    assert.ok(!JSON.stringify(audit).includes(key));
    assert.ok(!JSON.stringify(audit).includes(secret));
    await post(
      "/admin/providers/openai",
      { key: "fixture-provider-snapshot-first-12345" },
      cookie,
    );
    await post(
      "/admin/providers/openai",
      { key: "fixture-provider-snapshot-second-12345" },
      cookie,
    );
    assert.equal(
      (await post("/admin/providers/openai/restore", {}, cookie)).status,
      200,
    );
    const restored = (
      await pool.query(
        "SELECT encrypted_value,last_four FROM provider_credentials WHERE provider='openai'",
      )
    ).rows[0];
    assert.equal(
      decrypt(restored.encrypted_value, c.encryptionKey, "provider:openai"),
      "fixture-provider-snapshot-first-12345",
    );
    assert.equal(restored.last_four, "****");
    const visible = await (
      await realFetch(origin + "/api/admin/config", {
        headers: { Cookie: cookie },
      })
    ).json();
    assert.ok(!JSON.stringify(visible).includes("snapshot-first"));
    assert.ok(!Object.hasOwn(visible.providers[1], "last_four"));
    await pool.query(
      "DELETE FROM provider_credentials WHERE provider='openai'",
    );
  },
);

integration(
  "manual subscriptions grant once, issue a bounded user key and revoke account/device access",
  async () => {
    const admin = await post("/auth/admin", {
        email: c.adminEmail,
        password: c.adminPassword,
      }),
      cookie = admin.headers.get("set-cookie")!.split(";")[0];
    const email = randomUUID() + "@example.test",
      registration = await post("/auth/register", {
        email,
        name: "Manual fixture",
        password: "fixture-manual-password-123",
      });
    assert.equal(registration.status, 201);
    const userCookie = registration.headers.get("set-cookie")!.split(";")[0];
    const uid = (
      await pool.query("SELECT id FROM users WHERE email=$1", [email])
    ).rows[0].id;
    const grantBody = {
      request_id: randomUUID(),
      planId: "core",
      days: 5,
      credits: 100,
    };
    assert.equal(
      (
        await post(
          "/admin/users/" + uid + "/manual-subscription",
          grantBody,
          userCookie,
        )
      ).status,
      403,
    );
    const first = await post(
      "/admin/users/" + uid + "/manual-subscription",
      grantBody,
      cookie,
    );
    assert.equal(first.status, 201);
    const manualId = (await first.json()).id;
    assert.equal(
      (
        await post(
          "/admin/users/" + uid + "/manual-subscription",
          grantBody,
          cookie,
        )
      ).status,
      201,
    );
    assert.equal((await wallet(pool, "user:" + uid)).balance, 100);
    const keyResponse = await post("/account/licenses", {}, userCookie);
    assert.equal(keyResponse.status, 201);
    const key = (await keyResponse.json()).key;
    assert.equal((await post("/account/licenses", {}, userCookie)).status, 409);
    const activated = await activate(
      pool,
      c,
      key,
      "manual-fixture-device-12345",
      "Manual check",
      "windows",
    );
    assert.ok(await deviceAuth(pool, c, activated.refresh_token));
    assert.equal(
      (
        await post(
          "/admin/manual-subscriptions/" + manualId + "/edit",
          { planId: "creator", days: 3 },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await deviceAuth(pool, c, activated.refresh_token)).license.plan_id,
      "creator",
    );
    assert.equal(
      (
        await post(
          "/admin/credits",
          { email, credits: 25, reason: "fixture allocation" },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal((await wallet(pool, "user:" + uid)).balance, 125);
    assert.equal(
      (
        await post(
          "/admin/users/" + uid + "/status",
          { status: "blocked" },
          cookie,
        )
      ).status,
      200,
    );
    await assert.rejects(() => deviceAuth(pool, c, activated.refresh_token));
    await post("/admin/users/" + uid + "/status", { status: "active" }, cookie);
    assert.equal(
      (
        await post(
          "/admin/manual-subscriptions/" + manualId + "/revoke",
          {},
          cookie,
        )
      ).status,
      200,
    );
    await assert.rejects(() => deviceAuth(pool, c, activated.refresh_token));
    assert.equal(
      (await post("/admin/users/" + uid + "/remove", {}, cookie)).status,
      200,
    );
    const removed = (
      await pool.query("SELECT status,email FROM users WHERE id=$1", [uid])
    ).rows[0];
    assert.equal(removed.status, "deleted");
    assert.notEqual(removed.email, email);
    assert.equal(
      (
        await post(
          "/admin/users/" + uid + "/status",
          { status: "active" },
          cookie,
        )
      ).status,
      404,
    );
  },
);
