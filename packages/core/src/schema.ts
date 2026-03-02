/**
 * Soulguard config schema — runtime validation via Zod.
 *
 * The canonical type is SoulguardConfig in types.ts.
 * This schema validates against it at compile time via z.ZodType<T>.
 */

import { z } from "zod";
import type { SoulguardConfig } from "./types.js";

const tierSchema = z.enum(["protect", "watch"]);

export const soulguardConfigSchema: z.ZodType<SoulguardConfig> = z.object({
  version: z.literal(1),
  files: z.record(z.string(), tierSchema),
  git: z.boolean().optional(),
});

/**
 * Parse and validate a soulguard.json config object.
 */
export function parseConfig(raw: unknown): SoulguardConfig {
  return soulguardConfigSchema.parse(raw);
}
