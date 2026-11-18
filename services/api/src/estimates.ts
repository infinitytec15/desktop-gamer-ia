import { z } from "zod";
import type { Pool } from "pg";
import { briefSchema, geometrySchema } from "@gameforge/printing";
import { contextSchema, systemTask } from "./planner.js";
import { printingTask } from "./printing.js";
import { aiOptions, routeFor, budget } from "./routing.js";
export async function estimate(pool: Pool, body: unknown) {
  const b = z
    .discriminatedUnion("task", [
      z.strictObject({
        task: z.literal("system"),
        context: contextSchema,
        allow_fallback: z.boolean(),
        ...aiOptions,
      }),
      z.strictObject({
        task: z.literal("printing"),
        brief: briefSchema,
        geometry: geometrySchema.nullable(),
        allow_fallback: z.boolean(),
        ...aiOptions,
      }),
    ])
    .parse(body);
  const task = b.task === "system" ? systemTask : printingTask(b.brief);
  const input =
    b.task === "system" ? b.context : { brief: b.brief, geometry: b.geometry };
  return budget(
    await routeFor(pool, b, b.allow_fallback),
    input,
    task.schema,
    task.instructions,
    task.kind,
  );
}
