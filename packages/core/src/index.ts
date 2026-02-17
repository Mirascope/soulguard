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
} from "./types.js";
export { formatIssue } from "./types.js";

// Result (generic pattern)
export type { Result } from "./result.js";
export { ok, err } from "./result.js";

// Config
export { soulguardConfigSchema, parseConfig } from "./schema.js";

// System operations
export type { SystemOperations, FileStat } from "./system-ops.js";
export { getFileInfo } from "./system-ops.js";
export { MockSystemOps } from "./system-ops-mock.js";
export type { RecordedOp } from "./system-ops-mock.js";

// Status
export { status } from "./status.js";
export type { FileStatus, StatusResult, StatusOptions } from "./status.js";
