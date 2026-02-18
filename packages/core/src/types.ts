/**
 * Soulguard Core Types
 */

import type { SyncResult } from "./sync.js";

// ── Config ─────────────────────────────────────────────────────────────

/** User-level configuration (soulguard.json) */
export type SoulguardConfig = {
  /** Files protected as vault items (require owner approval to modify) */
  vault: string[];
  /** File patterns tracked as ledger items (agent writes freely, changes recorded) */
  ledger: string[];
};

// ── Tiers ──────────────────────────────────────────────────────────────

export type Tier = "vault" | "ledger";

// ── File primitives ────────────────────────────────────────────────────

/** OS-level ownership and permissions for a file */
export type FileOwnership = {
  user: string;
  group: string;
  /** e.g. "444", "644" */
  mode: string;
};

/** Snapshot of a file's state on disk */
export type FileInfo = {
  /** Relative path from workspace root */
  path: string;
  ownership: FileOwnership;
  /** SHA-256 hash of current contents */
  hash: string;
};

// ── Errors ─────────────────────────────────────────────────────────────

export type NotFoundError = { kind: "not_found"; path: string };
export type PermissionDeniedError = { kind: "permission_denied"; path: string; operation: string };
export type IOError = { kind: "io_error"; path: string; message: string };
export type UserNotFoundError = { kind: "user_not_found"; user: string };
export type GroupNotFoundError = { kind: "group_not_found"; group: string };

/** Union of all filesystem errors */
export type FileSystemError =
  | NotFoundError
  | PermissionDeniedError
  | IOError
  | UserNotFoundError
  | GroupNotFoundError;

// ── Drift issues (semantic, not strings) ───────────────────────────────

export type WrongOwnerIssue = { kind: "wrong_owner"; expected: string; actual: string };
export type WrongGroupIssue = { kind: "wrong_group"; expected: string; actual: string };
export type WrongModeIssue = { kind: "wrong_mode"; expected: string; actual: string };
export type HashFailedIssue = { kind: "hash_failed"; error: FileSystemError };

export type DriftIssue = WrongOwnerIssue | WrongGroupIssue | WrongModeIssue | HashFailedIssue;

/** Format a drift issue for display */
export function formatIssue(issue: DriftIssue): string {
  switch (issue.kind) {
    case "wrong_owner":
      return `owner is ${issue.actual}, expected ${issue.expected}`;
    case "wrong_group":
      return `group is ${issue.actual}, expected ${issue.expected}`;
    case "wrong_mode":
      return `mode is ${issue.actual}, expected ${issue.expected}`;
    case "hash_failed":
      return `hash failed: ${issue.error.kind}`;
  }
}

// ── Init ───────────────────────────────────────────────────────────────

/** Expected soulguard system user/group names per platform */
export type SystemIdentity = {
  /** System user that owns vault files (e.g. "_soulguard") */
  user: string;
  /** System group for vault files (e.g. "soulguard") */
  group: string;
};

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  /** Whether the system user was created (false if it already existed) */
  userCreated: boolean;
  /** Whether the system group was created (false if it already existed) */
  groupCreated: boolean;
  /** Whether the password hash was written (false if it already existed) */
  passwordSet: boolean;
  /** Whether soulguard.json was written (false if it already existed) */
  configCreated: boolean;
  /** Sync result from the initial sync after setup */
  syncResult: SyncResult;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "user_creation_failed"; message: string }
  | { kind: "group_creation_failed"; message: string }
  | { kind: "password_hash_failed"; message: string }
  | { kind: "config_write_failed"; message: string };

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

// ── Password ───────────────────────────────────────────────────────────

/** Argon2 hash stored in .soulguard/.secret */
export type PasswordHash = {
  /** The argon2id hash string */
  hash: string;
};

// Re-export Result from result.ts for convenience
export type { Result } from "./result.js";
export { ok, err } from "./result.js";
