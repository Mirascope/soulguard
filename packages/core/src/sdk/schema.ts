/**
 * Soulguard config schema — runtime validation via Zod.
 *
 * The canonical type is SoulguardConfig in types.ts.
 * This schema validates against it at compile time via z.ZodType<T>.
 */

import { z } from "zod";
import type { SoulguardConfig } from "../util/types.js";

export const tierSchema = z.enum(["protect", "watch"]);

const ownershipSchema = z.object({
  user: z.string(),
  group: z.string(),
  mode: z.string(),
});

/** Default debounce period (ms) after last staging write before proposing. */
export const DEFAULT_DEBOUNCE_MS = 3000;
/** Default max wait (ms) for .wait-for-ready sentinel removal. */
export const DEFAULT_BATCH_READY_TIMEOUT_MS = 300_000; // 5 minutes

const daemonConfigSchema = z
  .object({
    channel: z.string(),
    debounceMs: z.number().int().positive().optional(),
    batchReadyTimeoutMs: z.number().int().positive().optional(),
  })
  .passthrough(); // Allow channel-specific keys (e.g. "discord": { ... })

export const soulguardConfigSchema: z.ZodType<SoulguardConfig> = z.object({
  version: z.literal(1),
  guardian: z.string(),
  files: z.record(z.string(), tierSchema),
  git: z.boolean().optional(),
  defaultOwnership: ownershipSchema.optional(),
  daemon: daemonConfigSchema.optional(),
});

/**
 * Parse and validate a soulguard.json config object.
 */
export function parseConfig(raw: unknown): SoulguardConfig {
  return soulguardConfigSchema.parse(raw);
}
