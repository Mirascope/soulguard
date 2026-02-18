/**
 * Proposal types — staging-based vault change proposals.
 *
 * At most one active proposal at a time. Staging dir holds agent-writable
 * copies of vault files. `propose` diffs staging vs protected. `approve`
 * verifies hashes, applies changes, re-vaults, clears staging.
 */

/** A single file change within a proposal */
export type ProposalFile = {
  /** Relative path of the vault file */
  path: string;
  /** SHA-256 hash of the protected (current) file at propose time */
  protectedHash: string;
  /** SHA-256 hash of the staged (proposed) file at propose time */
  stagedHash: string;
};

/** Proposal stored as .soulguard/proposal.json */
export type Proposal = {
  /** Schema version for forward compatibility */
  version: "1";
  /** Human-readable reason for the changes */
  message: string;
  /** ISO-8601 timestamp when proposed */
  createdAt: string;
  /** Changed files with hashes for stale detection */
  files: ProposalFile[];
};

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
