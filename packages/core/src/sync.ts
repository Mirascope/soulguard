/**
 * soulguard sync — fix all issues found by status.
 *
 * Runs status before and after applying fixes. The diff between
 * before and after IS what happened. Errors are explicit.
 */

import type { DriftIssue, FileSystemError, IOError } from "./types.js";
import { ok } from "./result.js";
import type { Result } from "./result.js";
import { status } from "./status.js";
import type { StatusOptions, StatusResult } from "./status.js";
import { isGitEnabled, gitCommit } from "./git.js";
import type { GitCommitResult } from "./git.js";
import { resolvePatterns } from "./glob.js";
import { protectPatterns, watchPatterns } from "./config.js";

export type SyncError = {
  path: string;
  operation: string;
  error: FileSystemError;
};

export type SyncResult = {
  before: StatusResult;
  after: StatusResult;
  errors: SyncError[];
  /** Git commit result (best-effort, only when git enabled) */
  git?: GitCommitResult;
};

export type SyncOptions = StatusOptions;

/**
 * Run status, fix drifted files, run status again.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult, IOError>> {
  const { ops } = options;

  const beforeResult = await status(options);
  if (!beforeResult.ok) return beforeResult;
  const before = beforeResult.value;

  const errors: SyncError[] = [];

  for (const issue of before.issues) {
    if (issue.status !== "drifted") continue;

    // Only protect-tier files have ownership expectations
    if (issue.tier !== "protect") continue;
    const expectedOwnership = options.expectedProtectOwnership;

    const path = issue.file.path;
    const needsChown = issue.issues.some(
      (i: DriftIssue) => i.kind === "wrong_owner" || i.kind === "wrong_group",
    );
    const needsChmod = issue.issues.some((i: DriftIssue) => i.kind === "wrong_mode");

    if (needsChown) {
      const { user, group } = expectedOwnership;
      const result = await ops.chown(path, { user, group });
      if (!result.ok) {
        errors.push({ path, operation: "chown", error: result.error });
        // Short-circuit: if chown fails, chmod will almost certainly fail too.
        continue;
      }
    }

    if (needsChmod) {
      const result = await ops.chmod(path, expectedOwnership.mode);
      if (!result.ok) {
        errors.push({ path, operation: "chmod", error: result.error });
        continue;
      }
    }
  }

  const afterResult = await status(options);
  if (!afterResult.ok) return afterResult;
  const after = afterResult.value;

  // Best-effort git commit of all tracked files (protect + watch)
  let git: GitCommitResult | undefined;
  if (await isGitEnabled(ops, options.config)) {
    const [protectResolved, watchResolved] = await Promise.all([
      resolvePatterns(ops, protectPatterns(options.config)),
      resolvePatterns(ops, watchPatterns(options.config)),
    ]);
    const allFiles = [
      ...(protectResolved.ok ? protectResolved.value : []),
      ...(watchResolved.ok ? watchResolved.value : []),
    ];
    if (allFiles.length > 0) {
      const gitResult = await gitCommit(ops, allFiles, "soulguard: sync");
      if (gitResult.ok) {
        git = gitResult.value;
      }
      // Git errors swallowed — best-effort
    }
  }

  return ok({ before, after, errors, git });
}
