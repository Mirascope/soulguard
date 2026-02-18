// Shared primitives
export type {
  SoulguardConfig,
  Tier,
  FileOwnership,
  FileInfo,
  // Errors
  FileSystemError,
  NotFoundError,
  PermissionDeniedError,
  IOError,
  UserNotFoundError,
  GroupNotFoundError,
  // Drift issues
  DriftIssue,
  WrongOwnerIssue,
  WrongGroupIssue,
  WrongModeIssue,
  HashFailedIssue,
  // System identity
  SystemIdentity,
} from "./types.js";
export { formatIssue } from "./types.js";

// Result (generic pattern)
export type { Result } from "./result.js";
export { ok, err } from "./result.js";

// Config
export {
  soulguardConfigSchema,
  parseConfig,
  proposalSchema,
  passwordHashSchema,
} from "./schema.js";

// System operations
export type { SystemOperations, FileStat } from "./system-ops.js";
export { getFileInfo } from "./system-ops.js";
export { MockSystemOps } from "./system-ops-mock.js";
export type { RecordedOp } from "./system-ops-mock.js";
export { NodeSystemOps } from "./system-ops-node.js";

// Status
export { status } from "./status.js";
export type { FileStatus, StatusResult, StatusOptions } from "./status.js";

// Sync
export { sync } from "./sync.js";
export type { SyncError, SyncResult, SyncOptions } from "./sync.js";

// Init
export type { InitResult, InitError } from "./init.js";

// Proposals
export type { ProposalStatus, Proposal, ProposeError, ApprovalError } from "./proposal.js";

// Password
export type { PasswordHash } from "./password.js";

// Console output
export type { ConsoleOutput } from "./console.js";
export { LiveConsoleOutput } from "./console-live.js";

// CLI commands
export { StatusCommand } from "./cli/status-command.js";
export { SyncCommand } from "./cli/sync-command.js";
