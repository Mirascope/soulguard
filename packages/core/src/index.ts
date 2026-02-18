// Types
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
  // Status
  FileStatus,
  StatusResult,
  // Sync
  SyncError,
  SyncResult,
  // Init
  SystemIdentity,
  InitResult,
  InitError,
  // Proposals
  ProposalStatus,
  Proposal,
  ProposeError,
  ApprovalError,
  // Password
  PasswordHash,
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

// Sync
export { sync } from "./sync.js";
export type { SyncOptions } from "./sync.js";

// Status
export { status } from "./status.js";
export type { StatusOptions } from "./status.js";

// Console output
export type { ConsoleOutput } from "./console.js";
export { LiveConsoleOutput } from "./console-live.js";

// CLI commands
export { StatusCommand } from "./cli/status-command.js";
export { SyncCommand } from "./cli/sync-command.js";
