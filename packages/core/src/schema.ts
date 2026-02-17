/**
 * Soulguard config schema — runtime validation + type inference via Zod.
 * This validates soulguard.json files.
 *
 * Core is framework-agnostic: no default vault/ledger paths.
 * Framework plugins (e.g. @soulguard/openclaw) provide templates
 * with sensible defaults for their file conventions.
 */

import { z } from "zod";

export const soulguardConfigSchema = z.object({
  /** Files protected as vault items (require owner approval to modify) */
  vault: z.array(z.string()),
  /** File patterns tracked as ledger items (agent writes freely, changes recorded) */
  ledger: z.array(z.string()),
});

export type SoulguardConfigParsed = z.infer<typeof soulguardConfigSchema>;

/**
 * Parse and validate a soulguard.json config object.
 */
export function parseConfig(raw: unknown): SoulguardConfigParsed {
  return soulguardConfigSchema.parse(raw);
}
