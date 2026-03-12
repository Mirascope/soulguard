// Shared primitives
export type {
  SoulguardConfig,
  Tier,
  FileOwnership,
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
} from "./util/types.js";
export { formatIssue } from "./util/types.js";

// Result (generic pattern)
export type { Result } from "./util/result.js";
export { ok, err } from "./util/result.js";

// Config schema
export { soulguardConfigSchema, parseConfig } from "./sdk/schema.js";

// System operations
export type { SystemOperations, FileStat } from "./util/system-ops.js";
export { MockSystemOps } from "./util/system-ops-mock.js";
export type { RecordedOp } from "./util/system-ops-mock.js";
export { NodeSystemOps } from "./util/system-ops-node.js";

// State
export { StateTree } from "./sdk/state.js";
export type {
  StateFile,
  StateDirectory,
  StateEntity,
  FileStatus,
  Drift,
  BuildStateOptions,
} from "./sdk/state.js";

// Status
export { status } from "./sdk/status.js";
export type { StatusResult, StatusOptions } from "./sdk/status.js";

// Diff
export { diff } from "./sdk/diff.js";
export type { DiffFile, DiffResult, DiffError, DiffOptions } from "./sdk/diff.js";

// Sync
export { sync } from "./sdk/sync.js";
export type { SyncError, SyncResult, SyncOptions } from "./sdk/sync.js";

// Init
export type { InitResult, InitError, InitOptions } from "./sdk/init.js";
export {
  makeDefaultConfig,
  getProtectOwnership,
  guardianName,
  SOULGUARD_GROUP,
} from "./util/constants.js";

// Console output
export type { ConsoleOutput } from "./util/console.js";
export { LiveConsoleOutput } from "./util/console-live.js";

// Policy
export { validatePolicies, evaluatePolicies } from "./sdk/policy.js";
export type {
  Policy,
  PolicyViolation,
  PolicyError,
  PolicyCollisionError,
  ApprovalContext,
} from "./sdk/policy.js";

// Self-protection (hardcoded, cannot be bypassed)
export { validateSelfProtection } from "./sdk/self-protection.js";

// Apply
export { apply } from "./sdk/apply.js";
export type { ApplyOptions, ApplyResult, ApplyError } from "./sdk/apply.js";

// Reset
export { reset } from "./sdk/reset.js";
export type { ResetOptions, ResetResult, ResetError } from "./sdk/reset.js";

// Staging
export {
  stagingPath,
  isStagingPath,
  STAGING_DIR,
  DELETE_SENTINEL,
  isDeleteSentinel,
} from "./sdk/staging.js";

// Protect check
export { isProtectedFile, normalizePath } from "./sdk/protect-check.js";

// Config helpers
export {
  protectPatterns,
  watchPatterns,
  patternsForTier,
  readConfig,
  writeConfig,
} from "./sdk/config.js";
export type { ConfigError, ConfigWriteError } from "./sdk/config.js";

// Tier management
export { setTier, release } from "./sdk/tier.js";
export type { TierChangeResult, ReleaseResult } from "./sdk/tier.js";

// CLI commands
export { StatusCommand } from "./cli/status-command.js";
export { SyncCommand } from "./cli/sync-command.js";
export { DiffCommand } from "./cli/diff-command.js";
export { ApplyCommand } from "./cli/apply-command.js";
export type { ApplyCommandOptions } from "./cli/apply-command.js";
export { ResetCommand } from "./cli/reset-command.js";
export { TierCommand } from "./cli/tier-command.js";
export type { TierAction, TierCommandOptions } from "./cli/tier-command.js";
export { StageCommand } from "./cli/stage-command.js";
export type { StageCommandOptions } from "./cli/stage-command.js";
