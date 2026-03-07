/**
 * soulguard sync — fix all ownership drift in the workspace.
 *
 * Built on top of StateTree: one walk, one snapshot, pure derivations.
 *
 * 1. Build StateTree
 * 2. Detect drifted entities
 * 3. Fix ownership (registry pass first, then enforcement)
 * 4. Persist registry
 * 5. Best-effort git commit
 */

import type { DriftIssue, FileSystemError, IOError } from "../util/types.js";
import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";
import { StateTree } from "./state.js";
import { isGitEnabled, gitCommit } from "../util/git.js";
import type { GitCommitResult } from "../util/git.js";
import { protectPatterns, watchPatterns } from "./config.js";
import { Registry } from "./registry.js";

export type SyncError = {
  path: string;
  operation: string;
  error: FileSystemError;
};

export type SyncIssue = {
  path: string;
  status: "drifted" | "missing";
  tier: "protect" | "watch";
  issues?: DriftIssue[];
};

export type SyncResult = {
  /** Issues detected before fixing */
  beforeIssues: SyncIssue[];
  errors: SyncError[];
  /** Files released because they're no longer in config */
  released: string[];
  /** Git commit result (best-effort, only when git enabled) */
  git?: GitCommitResult;
};

export type SyncOptions = {
  config: { version: 1; files: Record<string, "protect" | "watch">; git?: boolean };
  expectedProtectOwnership: { user: string; group: string; mode: string };
  ops: import("../util/system-ops.js").SystemOperations;
};

/**
 * Build StateTree, detect drift, fix ownership.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult, IOError>> {
  const { ops, config } = options;

  // Build the unified state tree
  const treeResult = await StateTree.build({ ops, config });
  if (!treeResult.ok) {
    return err({
      kind: "io_error",
      path: "",
      message: treeResult.error.message,
    });
  }

  const tree = treeResult.value;
  const drifts = tree.driftedEntities();

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

  // Build before-issues from tree state
  const beforeIssues: SyncIssue[] = [];
  for (const drift of drifts) {
    beforeIssues.push({
      path: drift.entity.path,
      status: "drifted",
      tier: drift.entity.configTier as "protect" | "watch",
      issues: drift.details as DriftIssue[],
    });
  }

  // Check for missing config entries (not on disk, not in staging)
  const entityPaths = new Set(tree.entities.map((e) => e.path));
  for (const [key, tier] of Object.entries(config.files)) {
    const path = key.endsWith("/") ? key.slice(0, -1) : key;
    if (!entityPaths.has(path)) {
      beforeIssues.push({ path, status: "missing", tier: tier as "protect" | "watch" });
    }
  }

  const errors: SyncError[] = [];
  const released: string[] = [];

  // ── Pass 1: Registry updates ─────────────────────────────────────────
  {
    const configKeys = Object.keys(config.files);
    const managedPaths = new Set(configKeys.map((k) => (k.endsWith("/") ? k.slice(0, -1) : k)));

    // Register new entries
    for (const key of configKeys) {
      const path = key.endsWith("/") ? key.slice(0, -1) : key;
      const tier = config.files[key]!;
      const entry = registry.get(path);
      if (!entry) {
        await registry.register(path, tier);
      } else if (entry.tier !== tier) {
        // Tier changed: restore ownership if downgrading from protect→watch
        if (entry.tier === "protect" && tier === "watch") {
          const { user, group, mode } = entry.originalOwnership;
          const stat = await ops.stat(path);
          const isDir = stat.ok && stat.value.isDirectory;
          if (isDir) {
            const chownResult = await ops.chownRecursive(path, { user, group });
            const chmodResult = await ops.chmodRecursive(path, mode);
            if (!chownResult.ok) {
              errors.push({ path, operation: "chown", error: chownResult.error });
            } else if (!chmodResult.ok) {
              errors.push({ path, operation: "chmod", error: chmodResult.error });
            }
          } else {
            const chownResult = await ops.chown(path, { user, group });
            const chmodResult = await ops.chmod(path, mode);
            if (!chownResult.ok) {
              errors.push({ path, operation: "chown", error: chownResult.error });
            } else if (!chmodResult.ok) {
              errors.push({ path, operation: "chmod", error: chmodResult.error });
            }
          }
        }
        await registry.updateTier(path, tier);
      }
    }

    // Release orphaned entries
    for (const regPath of registry.paths()) {
      if (!managedPaths.has(regPath)) {
        const entry = registry.unregister(regPath);
        if (entry?.tier === "protect") {
          const { user, group, mode } = entry.originalOwnership;
          const stat = await ops.stat(regPath);
          const isDir = stat.ok && stat.value.isDirectory;
          if (isDir) {
            const chownResult = await ops.chownRecursive(regPath, { user, group });
            const chmodResult = await ops.chmodRecursive(regPath, mode);
            if (!chownResult.ok) {
              errors.push({ path: regPath, operation: "chown", error: chownResult.error });
            } else if (!chmodResult.ok) {
              errors.push({ path: regPath, operation: "chmod", error: chmodResult.error });
            } else {
              released.push(regPath);
            }
          } else if (stat.ok) {
            const chownResult = await ops.chown(regPath, { user, group });
            const chmodResult = await ops.chmod(regPath, mode);
            if (!chownResult.ok) {
              errors.push({ path: regPath, operation: "chown", error: chownResult.error });
            } else if (!chmodResult.ok) {
              errors.push({ path: regPath, operation: "chmod", error: chmodResult.error });
            } else {
              released.push(regPath);
            }
          } else {
            released.push(regPath);
          }
        } else {
          released.push(regPath);
        }
      }
    }
  }

  // ── Pass 2: Enforce ownership using tree drift data ──────────────────
  const releasedSet = new Set(released);
  for (const drift of drifts) {
    if (drift.entity.configTier !== "protect") continue;
    if (releasedSet.has(drift.entity.path)) continue;

    const expectedOwnership = options.expectedProtectOwnership;
    const path = drift.entity.path;
    const needsChown = drift.details.some(
      (i) => i.kind === "wrong_owner" || i.kind === "wrong_group",
    );
    const needsChmod = drift.details.some((i) => i.kind === "wrong_mode");

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

  if (errors.length > 0) {
    return ok({ beforeIssues, errors, released, git: undefined });
  }

  // Best-effort git commit
  let git: GitCommitResult | undefined;
  if (await isGitEnabled(ops, config)) {
    const allFiles = [...protectPatterns(config), ...watchPatterns(config)];
    if (allFiles.length > 0) {
      const gitResult = await gitCommit(ops, allFiles, "soulguard: sync");
      if (gitResult.ok) {
        git = gitResult.value;
      }
    }
  }

  return ok({ beforeIssues, errors, released, git });
}
