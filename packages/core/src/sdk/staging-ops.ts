/**
 * Shared staging helpers used by protect (auto-staging),
 * sync (gap-fill), create, and delete commands.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { FileOwnership, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { stagingPath, STAGING_DIR } from "./staging.js";
import { dirname } from "node:path";

/**
 * Check if a path is in the protect tier (either directly or as a child
 * of a protected directory).
 */
export function isInProtectTier(path: string, protectPatterns: string[]): boolean {
  for (const pattern of protectPatterns) {
    const normalized = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
    // Direct match (handles both "SOUL.md"=="SOUL.md" and "memory"=="memory/")
    if (path === normalized || path === pattern) return true;
    // Child of a protected directory (handles "skills/python.md" under "skills/" or "skills")
    if (path.startsWith(normalized + "/")) return true;
  }

  return false;
}

/**
 * Ensure parent directories exist for a staging path.
 *
 * When `ownership` is provided, chown+chmod created directories so the
 * agent can write into them. This is needed when called as root (protect/sync).
 */
export async function ensureStagingParentDir(
  ops: SystemOperations,
  canonicalPath: string,
  ownership?: FileOwnership,
): Promise<Result<void, string>> {
  const stagePath = stagingPath(canonicalPath);
  const parentDir = dirname(stagePath);
  if (parentDir === "." || parentDir === "/" || parentDir === STAGING_DIR) {
    return ok(undefined);
  }

  const mkdirResult = await ops.mkdir(parentDir);
  if (!mkdirResult.ok) {
    return err(`Cannot create parent directory ${parentDir}: ${mkdirResult.error.kind}`);
  }

  // Restore agent-writable ownership on staging directories
  if (ownership) {
    await ops.chown(parentDir, { user: ownership.user, group: ownership.group });
    await ops.chmod(parentDir, "755");
  }

  return ok(undefined);
}

/**
 * Create a staging copy of an existing canonical file.
 *
 * Reads content from the canonical path and writes to the staging path.
 * Uses read+write (not copyFile) to avoid inheriting 444 permissions.
 *
 * When `ownership` is provided, chown+chmod the staging copy so the agent
 * can edit it. This is needed when called from protect/sync (running as root).
 */
export async function createStagingCopy(
  ops: SystemOperations,
  path: string,
  ownership?: FileOwnership,
): Promise<Result<void, string>> {
  const stagePath = stagingPath(path);

  // Ensure parent dir (pass ownership so dirs are agent-writable)
  const parentResult = await ensureStagingParentDir(ops, path, ownership);
  if (!parentResult.ok) return parentResult;

  // Read canonical content
  const readResult = await ops.readFile(path);
  if (!readResult.ok) {
    return err(`Cannot read ${path}: ${readResult.error.kind}`);
  }

  // Write to staging (not copyFile, to avoid inheriting 444 permissions)
  const writeResult = await ops.writeFile(stagePath, readResult.value);
  if (!writeResult.ok) {
    return err(`Cannot write staging copy ${stagePath}: ${writeResult.error.kind}`);
  }

  // Restore agent-writable ownership if specified
  if (ownership) {
    await ops.chown(stagePath, { user: ownership.user, group: ownership.group });
    await ops.chmod(stagePath, ownership.mode);
  }

  return ok(undefined);
}
