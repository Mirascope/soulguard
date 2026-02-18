/**
 * Proposal types — vault change proposals.
 */

// ── Proposals ──────────────────────────────────────────────────────────

/** Status of a vault change proposal */
export type ProposalStatus = "pending" | "approved" | "rejected";

/** A proposed change to a vault file */
export type Proposal = {
  /** ULID — sortable, unique */
  id: string;
  /** Relative path of the vault file being changed */
  file: string;
  /** Human-readable reason for the change */
  message: string;
  /** ISO-8601 timestamp when proposed */
  createdAt: string;
  /** Current status */
  status: ProposalStatus;
  /** ISO-8601 timestamp when approved/rejected (undefined if pending) */
  resolvedAt?: string;
};

/** Errors specific to proposals */
export type ProposeError =
  | { kind: "not_vault_file"; path: string }
  | { kind: "file_not_found"; path: string }
  | { kind: "write_failed"; message: string };

/** Errors specific to approve/reject */
export type ApprovalError =
  | { kind: "proposal_not_found"; id: string }
  | { kind: "not_pending"; id: string; status: ProposalStatus }
  | { kind: "no_password_set" }
  | { kind: "wrong_password" }
  | { kind: "apply_failed"; message: string };
