/**
 * Soulguard config schema — runtime validation + type inference via Zod.
 * This validates soulguard.json files.
 */

import { z } from "zod";

export const soulguardConfigSchema = z.object({
  vault: z
    .array(z.string())
    .default([
      "SOUL.md",
      "AGENTS.md",
      "IDENTITY.md",
      "USER.md",
      "TOOLS.md",
      "HEARTBEAT.md",
      "MEMORY.md",
      "BOOTSTRAP.md",
      "soulguard.json",
    ]),
  ledger: z.array(z.string()).default(["memory/**", "skills/**"]),
  protectedPaths: z
    .array(z.string())
    .optional()
    .describe("Additional OS-protected paths beyond vault files"),
});

export type SoulguardConfigParsed = z.infer<typeof soulguardConfigSchema>;

/**
 * Parse and validate a soulguard.json config object.
 * Returns the validated config with defaults applied.
 */
export function parseConfig(raw: unknown): SoulguardConfigParsed {
  return soulguardConfigSchema.parse(raw);
}
