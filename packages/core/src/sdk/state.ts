/**
 * soulguard state — unified workspace state tree.
 *
 * Single codepath to build a complete snapshot of the workspace:
 * config, filesystem reality, and staging proposals.
 * All other SDK operations (status, diff, apply, sync) consume
 * this tree rather than doing their own filesystem walks.
 *
 * The state tree replaces the registry as the source of truth.
 * Config declares what should be managed + default ownership (for
 * restore on release). Filesystem reality + staging show what IS.
 * The delta between them drives every operation.
 *
 * Registry replacement plan:
 * - registry.ts tracked original ownership so sync/apply could restore
 *   it on release. The state tree eliminates the registry entirely.
 * - Original (pre-protect) ownership will move into soulguard.json
 *   config, captured at `soulguard init` time from package.json ownership.
 * - Config becomes the single source for both "what to manage" and
 *   "what to restore to", removing the need for a separate registry file.
 *
 * Config convention: directory entries have a trailing slash (e.g.
 * "skills/": "protect"), file entries do not (e.g. "SOUL.md": "protect").
 */

import { createHash } from "node:crypto";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, FileOwnership, Tier, DriftIssue, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { STAGING_DIR, stagingPath, isDeleteSentinel } from "./staging.js";
import { getProtectOwnership } from "../util/constants.js";

/** Protect-tier directory mode (directories need execute bit for traversal). */
export const PROTECT_DIR_MODE = "555";

// ── Node types ──────────────────────────────────────────────────────────

/** A node in the workspace state tree — either a file or a directory. */
export type StateEntity = StateFile | StateDirectory;

/** Staging status for a file. */
export type FileStatus = "unchanged" | "modified" | "created" | "deleted";

/** Snapshot of a single file's complete state across all layers. */
export type StateFile = {
  kind: "file";
  /** Relative path from workspace root */
  path: string;
  /** Tier declared in soulguard.json */
  configTier: Tier;
  /** Current ownership/permissions on disk (null = file doesn't exist) */
  ownership: FileOwnership | null;
  /** SHA-256 hash of canonical (on-disk) content (null = file doesn't exist) */
  canonicalHash: string | null;
  /** SHA-256 hash of staged content (null = no staging copy or deleted) */
  stagedHash: string | null;
  /** Staging status relative to canonical */
  status: FileStatus;
};

/**
 * Snapshot of a directory's state. Directories are structural containers
 * — change tracking lives on the files within. Directories carry ownership
 * for drift detection.
 */
export type StateDirectory = {
  kind: "directory";
  /** Relative path from workspace root (without trailing slash) */
  path: string;
  /** Tier declared in soulguard.json */
  configTier: Tier;
  /** Current ownership/permissions on the directory itself (null = doesn't exist) */
  ownership: FileOwnership | null;
  /** Whether a directory-level delete sentinel was found in staging */
  deleted: boolean;
  /** Recursive children (files and subdirectories) */
  children: StateEntity[];
};

/** An entity with ownership that doesn't match its tier expectations. */
export type Drift = {
  entity: StateEntity;
  details: DriftIssue[];
};

// ── Build options ───────────────────────────────────────────────────────

export type BuildStateOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
};

export type StateError = {
  kind: "build_failed";
  message: string;
};

// ── StateTree ───────────────────────────────────────────────────────────

/**
 * Immutable snapshot of the complete workspace state.
 *
 * Built via `StateTree.build()`, which performs a single walk across
 * config entries, the filesystem, and the staging tree. All downstream
 * operations (status, diff, apply, sync) consume this object's methods
 * rather than doing their own I/O.
 */
export class StateTree {
  /**
   * Top-level entities with real state (on disk and/or in staging).
   * Config entries where nothing exists on disk or in staging are omitted.
   */
  readonly entities: StateEntity[];
  /** Config as loaded */
  readonly config: SoulguardConfig;
  /** Expected ownership for protect-tier files */
  readonly protectOwnership: FileOwnership;

  private constructor(
    entities: StateEntity[],
    config: SoulguardConfig,
    protectOwnership: FileOwnership,
  ) {
    this.entities = entities;
    this.config = config;
    this.protectOwnership = protectOwnership;
  }

  /**
   * Build the complete workspace state tree.
   *
   * Walks every config entry, stats the canonical file (or directory
   * recursively), checks for staging copies, and assembles the full
   * snapshot. One walk, one tree, no registry needed.
   *
   * Config entries where nothing exists on disk or in staging are
   * skipped — no ghost entities. Config: trailing slash explicitly marks a
   * directory; paths without trailing slash are auto-detected via stat.
   */
  static async build(options: BuildStateOptions): Promise<Result<StateTree, StateError>> {
    const { ops, config } = options;
    const protectOwnership = getProtectOwnership(config.guardian);
    const entities: StateEntity[] = [];

    for (const [key, tier] of Object.entries(config.files)) {
      // Determine if this entry is a directory:
      // 1. Trailing slash in config key is explicit directory marker
      // 2. Otherwise, stat the path to auto-detect
      let isDir = key.endsWith("/");
      const path = isDir ? key.slice(0, -1) : key;

      if (!isDir) {
        const statResult = await ops.stat(path);
        if (statResult.ok && statResult.value.isDirectory) {
          isDir = true;
        }
      }

      if (isDir) {
        const result = await buildDirectory(ops, path, tier);
        if (!result.ok) return result;
        if (result.value) entities.push(result.value);
      } else {
        const result = await buildFile(ops, key, tier);
        if (!result.ok) return result;
        if (result.value) entities.push(result.value);
      }
    }

    return ok(new StateTree(entities, config, protectOwnership));
  }

  // ── Derivations ─────────────────────────────────────────────────────
  // Pure methods that project the state into domain-specific views.
  // No I/O — all information comes from the snapshot.

  /**
   * Flatten all StateFiles out of the tree, recursing into directories.
   */
  flatFiles(): StateFile[] {
    return collectFiles(this.entities);
  }

  /**
   * Deterministic approval hash over all actionable changes.
   *
   * Used by `soulguard diff` for display and `soulguard apply --hash`
   * for verification. Returns null if there are no pending changes.
   */
  get approvalHash(): string | null {
    const changed = this.changedFiles();
    if (changed.length === 0) return null;

    // Sort by path for determinism, then hash each file's identity
    const sorted = [...changed].sort((a, b) => a.path.localeCompare(b.path));
    const hasher = createHash("sha256");
    for (const file of sorted) {
      hasher.update(file.path);
      hasher.update(file.status);
      hasher.update(file.canonicalHash ?? "null");
      hasher.update(file.stagedHash ?? "null");
    }
    return hasher.digest("hex");
  }

  /**
   * All files with pending changes (status !== "unchanged").
   */
  changedFiles(): StateFile[] {
    return this.flatFiles().filter((f) => f.status !== "unchanged");
  }

  /**
   * All files that have a staging copy (regardless of whether content differs).
   *
   * A file is staged if it has a stagedHash (content in staging) or a delete
   * sentinel (status === "deleted"). This is broader than changedFiles() —
   * it includes files staged for editing whose content hasn't been modified yet.
   */
  stagedFiles(): StateFile[] {
    return this.flatFiles().filter((f) => f.stagedHash !== null || f.status === "deleted");
  }

  /**
   * All entities whose actual ownership doesn't match expectations
   * for their config tier. Protect-tier files should be
   * guardian:soulguard 444, directories 555.
   * Watch-tier entities are not checked.
   */
  driftedEntities(): Drift[] {
    return collectDrifts(this.entities, this.protectOwnership);
  }
}

// ── Private helpers ──────────────────────────────────────────────────

function collectFiles(entities: StateEntity[]): StateFile[] {
  const files: StateFile[] = [];
  for (const entity of entities) {
    if (entity.kind === "file") {
      files.push(entity);
    } else {
      files.push(...collectFiles(entity.children));
    }
  }
  return files;
}

function collectDrifts(entities: StateEntity[], protectOwnership: FileOwnership): Drift[] {
  const drifts: Drift[] = [];
  for (const entity of entities) {
    if (entity.configTier === "protect" && entity.ownership) {
      const details: DriftIssue[] = [];
      const expectedMode = entity.kind === "directory" ? PROTECT_DIR_MODE : protectOwnership.mode;

      if (entity.ownership.user !== protectOwnership.user) {
        details.push({
          kind: "wrong_owner",
          expected: protectOwnership.user,
          actual: entity.ownership.user,
        });
      }
      if (entity.ownership.group !== protectOwnership.group) {
        details.push({
          kind: "wrong_group",
          expected: protectOwnership.group,
          actual: entity.ownership.group,
        });
      }
      if (entity.ownership.mode !== expectedMode) {
        details.push({ kind: "wrong_mode", expected: expectedMode, actual: entity.ownership.mode });
      }

      if (details.length > 0) {
        drifts.push({ entity, details });
      }
    }
    if (entity.kind === "directory") {
      drifts.push(...collectDrifts(entity.children, protectOwnership));
    }
  }
  return drifts;
}

async function buildFile(
  ops: SystemOperations,
  path: string,
  tier: Tier,
): Promise<Result<StateFile | null, StateError>> {
  // Check canonical (on-disk)
  const statResult = await ops.stat(path);
  let diskExists = false;
  let ownership: FileOwnership | null = null;

  if (statResult.ok) {
    diskExists = true;
    ownership = statResult.value.ownership;
  } else if (statResult.error.kind !== "not_found") {
    return err({
      kind: "build_failed",
      message: `stat failed for ${path}: ${statResult.error.kind}`,
    });
  }

  let canonicalHash: string | null = null;
  if (diskExists) {
    const hashResult = await ops.hashFile(path);
    if (!hashResult.ok) {
      return err({
        kind: "build_failed",
        message: `hash failed for ${path}: ${hashResult.error.kind}`,
      });
    }
    canonicalHash = hashResult.value;
  }

  // Check staging
  const staged = stagingPath(path);
  const stagedExists = await ops.exists(staged);
  if (!stagedExists.ok) {
    return err({
      kind: "build_failed",
      message: `exists check failed for ${staged}: ${stagedExists.error.kind}`,
    });
  }

  let stagedHash: string | null = null;
  let isDelete = false;

  if (stagedExists.value) {
    const content = await ops.readFile(staged);
    if (!content.ok) {
      return err({
        kind: "build_failed",
        message: `read failed for ${staged}: ${content.error.kind}`,
      });
    }
    if (isDeleteSentinel(content.value)) {
      isDelete = true;
    } else {
      const hashResult = await ops.hashFile(staged);
      if (!hashResult.ok) {
        return err({
          kind: "build_failed",
          message: `hash failed for ${staged}: ${hashResult.error.kind}`,
        });
      }
      stagedHash = hashResult.value;
    }
  }

  // No ghost entities: skip if nothing on disk and nothing in staging
  if (!diskExists && !stagedExists.value) {
    return ok(null);
  }

  // Compute status
  let status: FileStatus;
  if (isDelete) {
    status = "deleted";
  } else if (!diskExists) {
    status = "created";
  } else if (stagedHash === null) {
    status = "unchanged";
  } else if (stagedHash === canonicalHash) {
    status = "unchanged";
  } else {
    status = "modified";
  }

  return ok({
    kind: "file",
    path,
    configTier: tier,
    ownership: ownership
      ? { user: ownership.user, group: ownership.group, mode: ownership.mode }
      : null,
    canonicalHash,
    stagedHash,
    status,
  });
}

async function buildDirectory(
  ops: SystemOperations,
  dirPath: string,
  tier: Tier,
): Promise<Result<StateDirectory | null, StateError>> {
  // Check if directory exists on disk
  const statResult = await ops.stat(dirPath);
  let diskExists = false;
  let ownership: FileOwnership | null = null;

  if (statResult.ok) {
    if (statResult.value.isDirectory) {
      diskExists = true;
      ownership = statResult.value.ownership;
    }
    // If stat succeeds but it's not a directory, treat as non-existent dir
  } else if (statResult.error.kind !== "not_found") {
    return err({
      kind: "build_failed",
      message: `stat failed for ${dirPath}: ${statResult.error.kind}`,
    });
  }

  // Check for directory-level delete sentinel in staging
  // (staging path for a dir is a file containing the sentinel)
  const staged = stagingPath(dirPath);
  const stagedStat = await ops.stat(staged);
  let dirDelete = false;
  // stagedStat returning not_found is expected — no staging entry for this dir
  if (stagedStat.ok && !stagedStat.value.isDirectory) {
    const content = await ops.readFile(staged);
    if (!content.ok) {
      return err({
        kind: "build_failed",
        message: `read failed for ${staged}: ${content.error.kind}`,
      });
    }
    if (isDeleteSentinel(content.value)) {
      dirDelete = true;
    }
  } else if (!stagedStat.ok && stagedStat.error.kind !== "not_found") {
    return err({
      kind: "build_failed",
      message: `stat failed for ${staged}: ${stagedStat.error.kind}`,
    });
  }

  // No ghost: if dir doesn't exist on disk and no staging activity, skip
  if (!diskExists && !dirDelete) {
    // Also check if there's a staging directory with new files
    const stagedDirExists = stagedStat.ok && stagedStat.value.isDirectory;
    if (!stagedDirExists) return ok(null);
  }

  const children: StateEntity[] = [];

  // Collect children from disk
  const diskChildren = new Set<string>();
  if (diskExists) {
    const listResult = await ops.listDir(dirPath);
    if (!listResult.ok) {
      return err({
        kind: "build_failed",
        message: `listDir failed for ${dirPath}: ${listResult.error.kind}`,
      });
    }
    for (const childPath of listResult.value) {
      diskChildren.add(childPath);
    }
  }

  // Collect children from staging (may include new files)
  const stagedChildren = new Set<string>();
  if (!dirDelete) {
    // Reuse stagedStat from above — no need to stat again
    if (stagedStat.ok && stagedStat.value.isDirectory) {
      const stagedList = await ops.listDir(staged);
      if (!stagedList.ok) {
        return err({
          kind: "build_failed",
          message: `listDir failed for ${staged}: ${stagedList.error.kind}`,
        });
      }
      for (const stagedChildPath of stagedList.value) {
        // Convert staging path back to canonical path
        // e.g. ".soulguard-staging/skills/new.md" → "skills/new.md"
        const canonical = stagedChildPath.slice(STAGING_DIR.length + 1);
        stagedChildren.add(canonical);
      }
    }
  }

  // Union of all child paths
  const allChildren = new Set([...diskChildren, ...stagedChildren]);

  // Build each child file
  for (const childPath of [...allChildren].sort()) {
    if (dirDelete) {
      // Directory deletion propagates: all children get status "deleted".
      // listDir returns flat file paths (no subdirectories), so nested
      // dirs are flattened — e.g. skills/advanced/search.md appears as
      // a direct child file, not under a StateDirectory for advanced/.
      const childStat = await ops.stat(childPath);
      let childOwnership: FileOwnership | null = null;
      let childHash: string | null = null;
      if (childStat.ok) {
        childOwnership = {
          user: childStat.value.ownership.user,
          group: childStat.value.ownership.group,
          mode: childStat.value.ownership.mode,
        };
        const hashResult = await ops.hashFile(childPath);
        if (!hashResult.ok) {
          return err({
            kind: "build_failed",
            message: `hash failed for ${childPath}: ${hashResult.error.kind}`,
          });
        }
        childHash = hashResult.value;
      } else if (childStat.error.kind !== "not_found") {
        return err({
          kind: "build_failed",
          message: `stat failed for ${childPath}: ${childStat.error.kind}`,
        });
      }
      children.push({
        kind: "file",
        path: childPath,
        configTier: tier,
        ownership: childOwnership,
        canonicalHash: childHash,
        stagedHash: null,
        status: "deleted",
      });
    } else {
      const childResult = await buildFile(ops, childPath, tier);
      if (!childResult.ok) return childResult;
      if (childResult.value) children.push(childResult.value);
    }
  }

  // No ghost: if directory doesn't exist and has no children, skip
  if (!diskExists && children.length === 0) return ok(null);

  return ok({
    kind: "directory",
    path: dirPath,
    configTier: tier,
    ownership: ownership
      ? { user: ownership.user, group: ownership.group, mode: ownership.mode }
      : null,
    deleted: dirDelete,
    children,
  });
}
