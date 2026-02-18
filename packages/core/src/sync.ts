/**
 * soulguard sync — fix all issues found by status.
 *
 * Runs status before and after applying fixes. The diff between
 * before and after IS what happened. Errors are explicit.
 */

import type { DriftIssue, SyncError, SyncResult } from "./types.js";
import { ok } from "./result.js";
import type { Result } from "./result.js";
import { status } from "./status.js";
import type { StatusOptions, StatusResult } from "./status.js";

export type { SyncError, SyncResult };

export type SyncOptions = StatusOptions;

/**
 * Run status, fix drifted files, run status again.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult, never>> {
  const { ops } = options;

  const beforeResult = await status(options);
  if (!beforeResult.ok) return beforeResult;
  const before = beforeResult.value;

  const errors: SyncError[] = [];

  for (const issue of before.issues) {
    if (issue.status !== "drifted") continue;

    const expectedOwnership =
      issue.tier === "vault" ? options.expectedVaultOwnership : options.expectedLedgerOwnership;

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

  return ok({ before, after, errors });
}
