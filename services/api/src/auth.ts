import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { hashToken, secretToken, constantEqual } from "./security.js";
import { HttpError } from "./errors.js";
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string | null;
        role: "user" | "admin";
        email: string;
        name: string;
      };
    }
  }
}
export function cookieName(c: Config) {
  return c.production ? "__Host-gf_session" : "gf_session";
}
function tokenFromCookie(req: Request, c: Config) {
  const value = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName(c) + "="))
    ?.slice(cookieName(c).length + 1);
  return value && /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : null;
}
export function adminVersion(c: Config) {
  return hashToken(c.adminPassword, c.sessionSecret);
}
export async function issueSession(
  pool: Pool,
  c: Config,
  res: Response,
  userId: string | null,
  role: "user" | "admin",
) {
  const token = secretToken(),
    duration = role === "admin" ? 86400000 : 7 * 86400000;
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,role,admin_version,expires_at) VALUES($1,$2,$3,$4,$5)",
    [
      hashToken(token, c.sessionSecret),
      userId,
      role,
      role === "admin" ? adminVersion(c) : null,
      new Date(Date.now() + duration),
    ],
  );
  res.cookie(cookieName(c), token, {
    httpOnly: true,
    secure: c.production,
    sameSite: "lax",
    path: "/",
    maxAge: duration,
  });
}
export function sessionMiddleware(pool: Pool, c: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = tokenFromCookie(req, c);
      if (token) {
        const result = await pool.query(
          "SELECT s.user_id,s.role,s.admin_version,u.email,u.name,u.status FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
          [hashToken(token, c.sessionSecret)],
        );
        const row = result.rows[0];
        if (
          row &&
          ((row.role === "admin" &&
            constantEqual(row.admin_version || "", adminVersion(c))) ||
            (row.role === "user" && row.status === "active"))
        )
          req.auth = {
            userId: row.user_id,
            role: row.role,
            email: row.role === "admin" ? c.adminEmail : row.email,
            name: row.role === "admin" ? "Administrador" : row.name,
          };
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
export async function logout(
  pool: Pool,
  c: Config,
  req: Request,
  res: Response,
) {
  const token = tokenFromCookie(req, c);
  if (token)
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      hashToken(token, c.sessionSecret),
    ]);
  res.clearCookie(cookieName(c), {
    httpOnly: true,
    secure: c.production,
    sameSite: "lax",
    path: "/",
  });
}
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== "user")
    return next(new HttpError(401, "Entre na sua conta para continuar"));
  next();
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin")
    return next(new HttpError(403, "Acesso de administrador necessário"));
  next();
}
export function csrf(c: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.path.startsWith("/api/desktop/") ||
      req.path === "/api/webhooks/mercadopago"
    )
      return next();
    const origin = req.get("origin");
    const allowed = [
      c.appUrl,
      ...(!c.production
        ? ["http://127.0.0.1:1430", "http://localhost:1430"]
        : []),
    ];
    if (!origin || !allowed.includes(origin))
      return next(new HttpError(403, "Origem de requisição não autorizada"));
    next();
  };
}
export async function rateLimit(
  pool: Pool,
  c: Config,
  key: string,
  limit: number,
  seconds: number,
) {
  const bucket = Math.floor(Date.now() / 1000 / seconds),
    digest = hashToken(key, c.sessionSecret);
  const result = await pool.query(
    "INSERT INTO rate_limits(key,bucket,count) VALUES($1,$2,1) ON CONFLICT(key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
    [digest, bucket],
  );
  if (result.rows[0].count > limit)
    throw new HttpError(
      429,
      "Muitas tentativas. Aguarde antes de tentar novamente.",
    );
}
