import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { HttpError } from "./errors.js";

export const MODELS = {
  "gpt-6-luna": { provider: "openai", input: 0.1, output: 0.5, cache: 0.01 },
  "gpt-6.1-terra": { provider: "openai", input: 1, output: 5, cache: 0.05 },
  "gpt-6.1-sol": { provider: "openai", input: 2, output: 10, cache: 0.1 },
  "claude-haiku-5-5": {
    provider: "anthropic",
    input: 0.1,
    output: 0.5,
    cache: 0.01,
  },
  "claude-sonnet-5-5": {
    provider: "anthropic",
    input: 2,
    output: 10,
    cache: 0.1,
  },
  "claude-opus-5-5": {
    provider: "anthropic",
    input: 4,
    output: 20,
    cache: 0.2,
  },
} as const;
export type ModelId = keyof typeof MODELS;
export type Provider = "anthropic" | "openai";
export const aiOptions = {
  mode: z.enum(["economy", "balanced", "advanced"]).default("advanced"),
  effort: z.enum(["low", "medium", "high"]).default("low"),
  quote_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
export type AiOptions = {
  mode?: "economy" | "balanced" | "advanced";
  effort?: "low" | "medium" | "high";
  quote_hash?: string;
};
const pair = z.strictObject({
  primary: z.enum(Object.keys(MODELS) as [ModelId, ...ModelId[]]),
  fallback: z.enum(Object.keys(MODELS) as [ModelId, ...ModelId[]]).nullable(),
});
export const routingSchema = z
  .strictObject({ economy: pair, balanced: pair, advanced: pair })
  .superRefine((v, ctx) => {
    const price = (id: ModelId) => MODELS[id].input + MODELS[id].output;
    if (
      price(v.economy.primary) > price(v.balanced.primary) ||
      price(v.balanced.primary) > price(v.advanced.primary)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Modos devem manter custo crescente: Econômico, Equilibrado, Avançado",
      });
    for (const route of Object.values(v))
      if (route.primary === route.fallback)
        ctx.addIssue({
          code: "custom",
          message: "Fallback deve usar um modelo diferente",
        });
  });
export const DEFAULT_ROUTING = routingSchema.parse({
  economy: { primary: "gpt-6-luna", fallback: "claude-haiku-5-5" },
  balanced: { primary: "gpt-6.1-terra", fallback: "claude-sonnet-5-5" },
  advanced: { primary: "claude-opus-5-5", fallback: "gpt-6.1-sol" },
});
export async function routingSettings(pool: Pool) {
  const row = (
    await pool.query("SELECT config FROM ai_routing_settings WHERE id=true")
  ).rows[0];
  return row ? routingSchema.parse(row.config) : DEFAULT_ROUTING;
}
export function outputBudget(effort: string, provider: Provider) {
  return effort === "high"
    ? 10000
    : effort === "medium"
      ? 6500
      : provider === "anthropic"
        ? 4096
        : 4000;
}
export async function routeFor(
  pool: Pool,
  options: AiOptions,
  allowFallback: boolean,
) {
  const mode = options.mode || "advanced",
    effort = options.effort || "low";
  const selected = (await routingSettings(pool))[mode];
  const saved = (
    await pool.query("SELECT provider FROM provider_credentials")
  ).rows.map((r) => r.provider);
  const configured = (id: ModelId) =>
    saved.includes(MODELS[id].provider) ||
    !!process.env[
      MODELS[id].provider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : "OPENAI_API_KEY"
    ];
  const candidates = [
    selected.primary,
    ...(allowFallback && selected.fallback ? [selected.fallback] : []),
  ].filter(configured);
  if (!candidates.length)
    throw new HttpError(
      503,
      "Nenhum provedor configurado para este modo. Escolha outro modo ou peça ao administrador para configurar as chaves.",
    );
  return { mode, effort, models: candidates as ModelId[] };
}
export function budget(
  route: Awaited<ReturnType<typeof routeFor>>,
  input: unknown,
  schema: unknown,
  instructions: string,
  task: string,
) {
  const bytes =
    Buffer.byteLength(
      JSON.stringify(input) + JSON.stringify(schema) + instructions,
    ) + 2048;
  const reserved = route.models.reduce(
    (sum, id) =>
      sum +
      Math.ceil(
        (bytes * MODELS[id].input * 1.25 +
          outputBudget(route.effort, MODELS[id].provider) * MODELS[id].output) *
          1000,
      ),
    0,
  );
  const primary = MODELS[route.models[0]];
  const output =
    (task === "printing" ? 1100 : 350) *
    (route.effort === "high" ? 3 : route.effort === "medium" ? 1.7 : 1);
  const estimate =
    (Math.ceil(bytes / 3) * primary.input +
      Math.min(output, outputBudget(route.effort, primary.provider)) *
        primary.output) /
    1000;
  const quote_hash = createHash("sha256")
    .update(
      JSON.stringify({
        version: "rates-2026-11-18-v1",
        route,
        input,
        schema,
        instructions,
        reserved,
        task,
      }),
    )
    .digest("hex");
  return {
    quote_hash,
    mode: route.mode,
    effort: route.effort,
    models: route.models,
    estimated_credits: Math.ceil(estimate * 1000) / 1000,
    maximum_credits: reserved / 1_000_000,
    reserved_microcredits: reserved,
    unit: "credits",
    explanation:
      "Estimativa aproximada; reserva é o teto conservador incluindo fallback autorizado. Ao concluir, cobramos o uso informado e liberamos o restante. Mais esforço pode usar mais tokens; não garante mais qualidade.",
  };
}
