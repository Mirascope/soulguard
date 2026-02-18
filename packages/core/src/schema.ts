/**
 * Soulguard config schema — runtime validation via Zod.
 *
 * The canonical type is SoulguardConfig in types.ts.
 * This schema validates against it at compile time via z.ZodType<T>.
 */

import { z } from "zod";
import type { SoulguardConfig } from "./types.js";
import type { PasswordHash } from "./password.js";
import type { Proposal, ProposalFile } from "./proposal.js";

export const soulguardConfigSchema: z.ZodType<SoulguardConfig> = z.object({
  vault: z.array(z.string()),
  ledger: z.array(z.string()),
});

/**
 * Parse and validate a soulguard.json config object.
 */
export function parseConfig(raw: unknown): SoulguardConfig {
  return soulguardConfigSchema.parse(raw);
}

const proposalFileSchema: z.ZodType<ProposalFile> = z.object({
  path: z.string(),
  protectedHash: z.string(),
  stagedHash: z.string(),
});

export const proposalSchema: z.ZodType<Proposal> = z.object({
  version: z.literal("1"),
  message: z.string(),
  createdAt: z.string(),
  files: z.array(proposalFileSchema),
});

export const passwordHashSchema: z.ZodType<PasswordHash> = z.object({
  hash: z.string(),
});
