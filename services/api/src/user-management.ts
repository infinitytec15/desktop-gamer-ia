import type { Express } from "express";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config.js";
import { transaction, audit } from "./db.js";
import { grant, wallet } from "./credits.js";
import { HttpError } from "./errors.js";
export function userManagement(app: Express, pool: Pool, c: Config) {
  app.get("/api/admin/users/:id/details", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const user = (
      await pool.query("SELECT id,name,email,status FROM users WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!user) throw new HttpError(404, "Usuário não localizado");
    const manual =
      (
        await pool.query(
          "SELECT m.*,p.name plan_name FROM manual_subscriptions m JOIN plans p ON p.id=m.plan_id WHERE user_id=$1 AND m.status='active'",
          [id],
        )
      ).rows[0] || null;
    res.json({
      user,
      manual,
      credits: await wallet(pool, "user:" + id),
      plans: (
        await pool.query(
          "SELECT id,name,credits FROM plans WHERE active=true ORDER BY price_cents",
        )
      ).rows,
    });
  });
  app.post("/api/admin/users/:id/edit", async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      b = z
        .strictObject({
          name: z.string().trim().min(2).max(100),
          email: z.email().max(254),
        })
        .parse(req.body);
    const result = await pool.query(
      "UPDATE users SET name=$2,email=$3 WHERE id=$1 AND status<>'deleted' RETURNING id",
      [id, b.name, b.email.toLowerCase()],
    );
    if (!result.rows.length) throw new HttpError(404, "Usuário não localizado");
    await audit(pool, "admin", "user.edited", {
      id,
      fields: ["name", "email"],
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/users/:id/manual-subscription", async (req, res) => {
    const userId = z.uuid().parse(req.params.id),
      b = z
        .strictObject({
          request_id: z.uuid(),
          planId: z.string().min(1).max(40),
          days: z.number().int().min(1).max(366),
          credits: z.number().int().min(0).max(100000),
        })
        .parse(req.body);
    const result = await transaction(pool, async (db) => {
      const user = (
        await db.query("SELECT id,status FROM users WHERE id=$1 FOR UPDATE", [
          userId,
        ])
      ).rows[0];
      if (!user || user.status === "deleted")
        throw new HttpError(404, "Usuário não localizado");
      const previous = (
        await db.query(
          "SELECT id,user_id FROM manual_subscriptions WHERE request_id=$1",
          [b.request_id],
        )
      ).rows[0];
      if (previous) {
        if (previous.user_id !== userId)
          throw new HttpError(409, "Identificador em uso");
        return previous;
      }
      if (
        (
          await db.query(
            "SELECT id FROM subscriptions WHERE user_id=$1 AND status IN ('creating','pending','authorized','active','paused') LIMIT 1",
            [userId],
          )
        ).rows.length
      )
        throw new HttpError(
          409,
          "Gerencie primeiro o contrato Mercado Pago existente; uma concessão manual não altera a cobrança dele.",
        );
      await db.query(
        "UPDATE manual_subscriptions SET status='cancelled',updated_at=now() WHERE user_id=$1 AND status='active' AND ends_at<=now()",
        [userId],
      );
      if (
        (
          await db.query(
            "SELECT id FROM manual_subscriptions WHERE user_id=$1 AND status='active'",
            [userId],
          )
        ).rows.length
      )
        throw new HttpError(
          409,
          "Já existe uma assinatura manual. Edite ou remova a concessão atual.",
        );
      if (
        !(
          await db.query("SELECT id FROM plans WHERE id=$1 AND active=true", [
            b.planId,
          ])
        ).rows.length
      )
        throw new HttpError(400, "Plano indisponível");
      const id = randomUUID();
      await db.query(
        "INSERT INTO manual_subscriptions(id,user_id,plan_id,request_id,ends_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 day')",
        [id, userId, b.planId, b.request_id, b.days],
      );
      if (b.credits)
        await grant(
          db,
          "user:" + userId,
          "manual-subscription:" + id,
          b.credits,
          true,
        );
      return { id };
    });
    await audit(pool, "admin", "subscription.manual_granted", {
      userId,
      id: result.id,
      plan: b.planId,
      days: b.days,
      credits: b.credits,
    });
    res.status(201).json(result);
  });
  app.post("/api/admin/manual-subscriptions/:id/edit", async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      b = z
        .strictObject({
          planId: z.string().max(40),
          days: z.number().int().min(1).max(366),
        })
        .parse(req.body);
    await transaction(pool, async (db) => {
      const current = (
        await db.query(
          "SELECT * FROM manual_subscriptions WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!current || current.status !== "active")
        throw new HttpError(404, "Concessão ativa não localizada");
      if (
        !(
          await db.query("SELECT id FROM plans WHERE id=$1 AND active=true", [
            b.planId,
          ])
        ).rows.length
      )
        throw new HttpError(400, "Plano indisponível");
      const row = (
        await db.query(
          "UPDATE manual_subscriptions SET plan_id=$2,ends_at=now()+$3*interval '1 day',updated_at=now() WHERE id=$1 RETURNING ends_at",
          [id, b.planId, b.days],
        )
      ).rows[0];
      await db.query(
        "UPDATE licenses SET plan_id=$2,expires_at=$3 WHERE manual_subscription_id=$1 AND revoked_at IS NULL",
        [id, b.planId, row.ends_at],
      );
    });
    await audit(pool, "admin", "subscription.manual_edited", { id, ...b });
    res.json({ ok: true });
  });
  app.post("/api/admin/manual-subscriptions/:id/revoke", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await transaction(pool, async (db) => {
      const r = await db.query(
        "UPDATE manual_subscriptions SET status='cancelled',updated_at=now() WHERE id=$1 RETURNING id",
        [id],
      );
      if (!r.rows.length) throw new HttpError(404, "Concessão não localizada");
      await db.query(
        "UPDATE licenses SET revoked_at=now() WHERE manual_subscription_id=$1",
        [id],
      );
      await db.query(
        "UPDATE devices SET revoked_at=now() WHERE license_id IN (SELECT id FROM licenses WHERE manual_subscription_id=$1)",
        [id],
      );
    });
    await audit(pool, "admin", "subscription.manual_revoked", { id });
    res.json({ ok: true });
  });
  app.post("/api/admin/users/:id/remove", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await transaction(pool, async (db) => {
      if (
        (
          await db.query(
            "SELECT id FROM subscriptions WHERE user_id=$1 AND status IN ('creating','pending','authorized','active','paused')",
            [id],
          )
        ).rows.length
      )
        throw new HttpError(
          409,
          "Cancele e confira os contratos Mercado Pago antes de remover o acesso, para evitar cobrança sem acesso.",
        );
      const user = await db.query(
        "UPDATE users SET status='deleted',name='Conta removida',email=$2,password_hash='disabled' WHERE id=$1 AND status<>'deleted' RETURNING id",
        [id, "removed-" + id + "@invalid.local"],
      );
      if (!user.rows.length) throw new HttpError(404, "Usuário não localizado");
      await db.query(
        "UPDATE manual_subscriptions SET status='cancelled' WHERE user_id=$1",
        [id],
      );
      await db.query("UPDATE licenses SET revoked_at=now() WHERE user_id=$1", [
        id,
      ]);
      await db.query(
        "UPDATE devices SET revoked_at=now() WHERE license_id IN(SELECT id FROM licenses WHERE user_id=$1)",
        [id],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    });
    await audit(pool, "admin", "user.access_removed", { id });
    res.json({ ok: true });
  });
}
