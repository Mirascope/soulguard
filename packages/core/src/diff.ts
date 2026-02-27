/**
 * soulguard diff — compare vault files against their staging copies.
 */

import { createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import type { Result } from "./result.js";
import { ok, err } from "./result.js";
import type { SoulguardConfig } from "./types.js";
import type { SystemOperations } from "./system-ops.js";
import { resolvePatterns } from "./glob.js";

// ── Types ──────────────────────────────────────────────────────────────

export type FileDiff = {
  path: string;
  status: "modified" | "unchanged" | "vault_missing" | "staging_missing" | "deleted";
  /** Unified diff string (only for modified) */
  diff?: string;
  protectedHash?: string;
  stagedHash?: string;
};

export type DiffResult = {
  files: FileDiff[];
  hasChanges: boolean;
  /**
   * Approval hash — SHA-256 of all modified file paths + staged content hashes,
   * sorted deterministically. Used for hash-based approve integrity check.
   * Only present when there are changes.
   */
  approvalHash?: string;
};

export type DiffError =
  | { kind: "no_staging" }
  | { kind: "no_config" }
  | { kind: "read_failed"; path: string; message: string };

export type DiffOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Specific files to diff (default: all vault files) */
  files?: string[];
};

// ── Implementation ─────────────────────────────────────────────────────

const STAGING_DIR = ".soulguard/staging";

/**
 * Compare vault files against their staging copies.
 */
export async function diff(options: DiffOptions): Promise<Result<DiffResult, DiffError>> {
  const { ops, config, files: filterFiles } = options;

  // Check staging directory exists
  const stagingExists = await ops.exists(STAGING_DIR);
  if (!stagingExists.ok) {
    return err({ kind: "read_failed", path: STAGING_DIR, message: stagingExists.error.message });
  }
  if (!stagingExists.value) {
    return err({ kind: "no_staging" });
  }

  // Resolve glob patterns to concrete file paths
  const resolved = await resolvePatterns(ops, config.vault);
  if (!resolved.ok) {
    return err({ kind: "read_failed", path: "glob", message: resolved.error.message });
  }
  let vaultFiles = resolved.value;
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    vaultFiles = vaultFiles.filter((p) => filterSet.has(p));
  }

  const fileDiffs: FileDiff[] = [];

  for (const path of vaultFiles) {
    const stagingPath = `${STAGING_DIR}/${path}`;

    const [vaultExists, stagingFileExists] = await Promise.all([
      ops.exists(path),
      ops.exists(stagingPath),
    ]);

    if (!vaultExists.ok) {
      return err({ kind: "read_failed", path, message: vaultExists.error.message });
    }
    if (!stagingFileExists.ok) {
      return err({
        kind: "read_failed",
        path: stagingPath,
        message: stagingFileExists.error.message,
      });
    }

    // Missing cases
    if (vaultExists.value && !stagingFileExists.value) {
      // Vault file exists but staging copy deleted → agent wants to delete this file
      const vaultHash = await ops.hashFile(path);
      fileDiffs.push({
        path,
        status: "deleted",
        protectedHash: vaultHash.ok ? vaultHash.value : undefined,
      });
      continue;
    }
    if (!vaultExists.value && stagingFileExists.value) {
      // New file — hash staging so it's covered by the approval hash
      const newHash = await ops.hashFile(stagingPath);
      fileDiffs.push({
        path,
        status: "vault_missing",
        stagedHash: newHash.ok ? newHash.value : undefined,
      });
      continue;
    }
    if (!vaultExists.value && !stagingFileExists.value) {
      fileDiffs.push({ path, status: "staging_missing" });
      continue;
    }

    // Both exist — compare hashes
    const [vaultHash, stagingHash] = await Promise.all([
      ops.hashFile(path),
      ops.hashFile(stagingPath),
    ]);

    if (!vaultHash.ok) {
      return err({ kind: "read_failed", path, message: "hash failed" });
    }
    if (!stagingHash.ok) {
      return err({ kind: "read_failed", path: stagingPath, message: "hash failed" });
    }

    if (vaultHash.value === stagingHash.value) {
      fileDiffs.push({
        path,
        status: "unchanged",
        protectedHash: vaultHash.value,
        stagedHash: stagingHash.value,
      });
      continue;
    }

    // Modified — generate unified diff
    const [vaultContent, stagingContent] = await Promise.all([
      ops.readFile(path),
      ops.readFile(stagingPath),
    ]);

    if (!vaultContent.ok) {
      return err({ kind: "read_failed", path, message: "read failed" });
    }
    if (!stagingContent.ok) {
      return err({ kind: "read_failed", path: stagingPath, message: "read failed" });
    }

    const unifiedDiff = createTwoFilesPatch(
      `a/${path}`,
      `b/${path}`,
      vaultContent.value,
      stagingContent.value,
    );

    fileDiffs.push({
      path,
      status: "modified",
      diff: unifiedDiff,
      protectedHash: vaultHash.value,
      stagedHash: stagingHash.value,
    });
  }

  const hasChanges = fileDiffs.some((f) => f.status !== "unchanged");

  // Compute approval hash from modified files (deterministic)
  let approvalHash: string | undefined;
  if (hasChanges) {
    approvalHash = computeApprovalHash(fileDiffs);
  }

  return ok({ files: fileDiffs, hasChanges, approvalHash });
}

/**
 * Compute a deterministic approval hash from file diffs.
 * Covers all modified files — sorted by path, hashing path + stagedHash pairs.
 * This is the integrity token for hash-based approve.
 */
export function computeApprovalHash(files: FileDiff[]): string {
  // Include modified, new (vault_missing), and deleted files in the hash
  const actionable = files
    .filter(
      (f) =>
        ((f.status === "modified" || f.status === "vault_missing") && f.stagedHash) ||
        f.status === "deleted",
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const hash = createHash("sha256");
  for (const f of actionable) {
    if (f.status === "deleted") {
      // Use a sentinel for deletions — hash includes the vault hash to prevent replay
      hash.update(`${f.path}\0DELETED\0${f.protectedHash ?? ""}\0`);
    } else {
      hash.update(`${f.path}\0${f.stagedHash}\0`);
    }
  }
  return hash.digest("hex");
}
