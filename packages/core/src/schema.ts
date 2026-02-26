/**
 * Soulguard config schema — runtime validation via Zod.
 *
 * The canonical type is SoulguardConfig in types.ts.
 * This schema validates against it at compile time via z.ZodType<T>.
 */

import { z } from "zod";
import type { SoulguardConfig } from "./types.js";

export const soulguardConfigSchema: z.ZodType<SoulguardConfig> = z.object({
  vault: z.array(z.string()),
  ledger: z.array(z.string()),
  git: z.boolean().optional(),
});

/**
 * Parse and validate a soulguard.json config object.
 */
export function parseConfig(raw: unknown): SoulguardConfig {
  return soulguardConfigSchema.parse(raw);
}
