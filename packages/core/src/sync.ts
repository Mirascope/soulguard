/**
 * soulguard sync — fix all issues found by status.
 *
 * Status detects, sync fixes. That's the contract.
 *
 * 1. Load registry
 * 2. Run status (with registry) to get all issues
 * 3. Fix each issue (two passes: registry first, enforcement second)
 * 4. Persist registry
 * 5. Best-effort git commit
 */

import type { DriftIssue, FileSystemError, IOError } from "./types.js";
import { ok, err } from "./result.js";
import type { Result } from "./result.js";
import { status } from "./status.js";
import type { StatusOptions, StatusResult } from "./status.js";
import { isGitEnabled, gitCommit } from "./git.js";
import type { GitCommitResult } from "./git.js";
import { resolvePatterns } from "./glob.js";
import { protectPatterns, watchPatterns } from "./config.js";
import { Registry } from "./registry.js";

export type SyncError = {
  path: string;
  operation: string;
  error: FileSystemError;
};

export type SyncResult = {
  before: StatusResult;
  errors: SyncError[];
  /** Files released because they're no longer in config */
  released: string[];
  /** Git commit result (best-effort, only when git enabled) */
  git?: GitCommitResult;
};

export type SyncOptions = Omit<StatusOptions, "registry">;

/**
 * Run status, fix all issues.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult, IOError>> {
  const { ops } = options;

  // Load registry
  const registryResult = await Registry.load(ops);
  if (!registryResult.ok) {
    return err({
      kind: "io_error",
      path: ".soulguard/registry.json",
      message: `registry read failed: ${registryResult.error.message}`,
    });
  }
  const registry = registryResult.value;

  // Status with registry — detects everything
  const beforeResult = await status({ ...options, registry });
  if (!beforeResult.ok) return beforeResult;
  const before = beforeResult.value;

  const errors: SyncError[] = [];
  const released: string[] = [];

  // ── Pass 1: Registry updates (snapshot ownership BEFORE enforcement) ───────
  for (const issue of before.issues) {
    switch (issue.status) {
      case "unregistered": {
        await registry.register(issue.path, issue.tier);
        break;
      }
      case "tier_changed": {
        await registry.updateTier(issue.path, issue.tier);
        break;
      }
      case "orphaned": {
        const entry = registry.unregister(issue.path);

        if (entry?.originalOwnership) {
          const { user, group, mode } = entry.originalOwnership;
          const chownResult = await ops.chown(issue.path, { user, group });
          const chmodResult = await ops.chmod(issue.path, mode);

          if (!chownResult.ok) {
            errors.push({ path: issue.path, operation: "chown", error: chownResult.error });
          } else if (!chmodResult.ok) {
            errors.push({ path: issue.path, operation: "chmod", error: chmodResult.error });
          } else {
            released.push(issue.path);
          }
        } else {
          released.push(issue.path);
        }
        break;
      }
    }
  }

  // ── Pass 2: Enforce ownership (AFTER registry snapshots) ─────────────────
  const releasedSet = new Set(released);
  for (const issue of before.issues) {
    if (issue.status !== "drifted" || issue.tier !== "protect") continue;
    if (releasedSet.has(issue.file.path)) continue;

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
        continue;
      }
    }
    if (needsChmod) {
      const result = await ops.chmod(path, expectedOwnership.mode);
      if (!result.ok) {
        errors.push({ path, operation: "chmod", error: result.error });
      }
    }
  }

  // Persist updated registry
  const writeResult = await registry.write();
  if (!writeResult.ok) {
    return err({
      kind: "io_error",
      path: ".soulguard/registry.json",
      message: `registry write failed: ${writeResult.error.message}`,
    });
  }

  // Error if we failed to fix issues
  if (errors.length > 0) {
    return ok({ before, errors, released, git: undefined });
  }

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
    }
  }

  return ok({ before, errors, released, git });
}
