/**
 * Staging path helpers.
 *
 * Staging copies live in a staging tree directory:
 *   SOUL.md → .soulguard-staging/SOUL.md
 *   memory/notes.md → .soulguard-staging/memory/notes.md
 *
 * Benefits: clean separation, no dotfile pollution, preserves directory structure.
 */

import { join } from "node:path";

/** Directory for staging tree. */
export const STAGING_DIR = ".soulguard-staging";

/**
 * Compute the staging path for a given file path.
 *
 * @example stagingPath("SOUL.md") → ".soulguard-staging/SOUL.md"
 * @example stagingPath("memory/notes.md") → ".soulguard-staging/memory/notes.md"
 */
export function stagingPath(filePath: string): string {
  return join(STAGING_DIR, filePath);
}

/**
 * Check if a path is inside the staging tree.
 */
export function isStagingPath(filePath: string): boolean {
  return filePath === STAGING_DIR || filePath.startsWith(STAGING_DIR + "/");
}

/** Sentinel value written to staging to indicate a file should be deleted. */
export const DELETE_SENTINEL = { __soulguard_delete_sentinel__: true } as const;

/**
 * Check if file content represents a delete sentinel.
 */
export function isDeleteSentinel(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed != null && parsed.__soulguard_delete_sentinel__ === true;
  } catch {
    return false;
  }
}
