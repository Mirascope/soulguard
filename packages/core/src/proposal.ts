/**
 * Proposal types — staging-based vault change proposals.
 *
 * At most one active proposal at a time. Staging dir holds agent-writable
 * copies of vault files. `propose` diffs staging vs protected. `approve`
 * verifies hashes, applies changes, re-vaults, clears staging.
 */

import { z } from "zod";

const ProposalFileSchema = z.object({
  path: z.string().min(1),
  protectedHash: z.string().min(1),
  stagedHash: z.string().min(1),
});

const ProposalSchema = z.object({
  version: z.literal("1"),
  message: z.string(),
  createdAt: z.string(),
  files: z.array(ProposalFileSchema).min(1),
});

/** A single file change within a proposal */
export type ProposalFile = z.infer<typeof ProposalFileSchema>;

/** Proposal stored as .soulguard/proposal.json */
export type Proposal = z.infer<typeof ProposalSchema>;

/**
 * Parse and validate proposal JSON. Returns null if invalid.
 * This is a security boundary — the agent can write to .soulguard/,
 * so proposal.json must be validated before trusting its contents.
 */
export function parseProposal(json: string): Proposal | null {
  try {
    const parsed = JSON.parse(json);
    const result = ProposalSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Errors specific to staging */
export type StageError =
  | { kind: "no_config" }
  | { kind: "staging_has_changes"; message: string }
  | { kind: "write_failed"; path: string; message: string };

/** Errors specific to propose */
export type ProposeError =
  | { kind: "no_staging"; message: string }
  | { kind: "no_changes" }
  | { kind: "proposal_exists" }
  | { kind: "write_failed"; message: string };

/** Errors specific to approve */
export type ApprovalError =
  | { kind: "no_proposal" }
  | { kind: "wrong_password" }
  | { kind: "stale_proposal"; message: string }
  | { kind: "apply_failed"; message: string };

/** Errors specific to reject */
export type RejectError =
  | { kind: "no_proposal" }
  | { kind: "wrong_password" }
  | { kind: "reset_failed"; message: string };
