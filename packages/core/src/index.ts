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
export { soulguardConfigSchema, parseConfig } from "./schema.js";

// System operations
export type { SystemOperations, FileStat } from "./system-ops.js";
export { getFileInfo } from "./system-ops.js";
export { MockSystemOps } from "./system-ops-mock.js";
export type { RecordedOp } from "./system-ops-mock.js";
export { NodeSystemOps } from "./system-ops-node.js";

// Status
export { status } from "./status.js";
export type { FileStatus, StatusResult, StatusOptions } from "./status.js";

// Diff
export { diff } from "./diff.js";
export type { FileDiff, DiffResult, DiffError, DiffOptions } from "./diff.js";

// Sync
export { sync } from "./sync.js";
export type { SyncError, SyncResult, SyncOptions } from "./sync.js";

// Init
export type { InitResult, InitError } from "./init.js";
export { DEFAULT_CONFIG } from "./constants.js";

// Console output
export type { ConsoleOutput } from "./console.js";
export { LiveConsoleOutput } from "./console-live.js";

// Policy
export { validatePolicies, evaluatePolicies } from "./policy.js";
export type {
  Policy,
  PolicyViolation,
  PolicyError,
  PolicyCollisionError,
  ApprovalContext,
} from "./policy.js";

// Self-protection (hardcoded, cannot be bypassed)
export { validateSelfProtection } from "./self-protection.js";

// Apply
export { apply } from "./apply.js";
export type { ApplyOptions, ApplyResult, ApplyError } from "./apply.js";

// Reset
export { reset } from "./reset.js";
export type { ResetOptions, ResetResult, ResetError } from "./reset.js";

// Git integration
export {
  isGitEnabled,
  gitCommit,
  gitLog,
  protectCommitMessage,
  watchCommitMessage,
  commitWatchFiles,
} from "./git.js";
export type { GitCommitResult, GitError } from "./git.js";

// Staging
export { stagingPath, isStagingPath, STAGING_PREFIX } from "./staging.js";

// Protect check + glob
export { isProtectedFile, normalizePath } from "./protect-check.js";
export { isGlob, matchGlob, createGlobMatcher, resolvePatterns } from "./glob.js";

// CLI commands
export { StatusCommand } from "./cli/status-command.js";
export { SyncCommand } from "./cli/sync-command.js";
export { DiffCommand } from "./cli/diff-command.js";
export { ApplyCommand } from "./cli/apply-command.js";
export type { ApplyCommandOptions } from "./cli/apply-command.js";
export { ResetCommand } from "./cli/reset-command.js";
export { protectPatterns, watchPatterns, patternsForTier } from "./config.js";
