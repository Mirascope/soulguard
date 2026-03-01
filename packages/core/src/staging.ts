/**
 * Staging path helpers.
 *
 * Staging copies live alongside their originals as dotfile siblings:
 *   SOUL.md → .soulguard.SOUL.md
 *   memory/notes.md → memory/.soulguard.notes.md
 *
 * Benefits: preserves file extension (IDE syntax highlighting),
 * no deep path indirection, visible with ls -a.
 */

import { dirname, basename, join } from "node:path";

/** Prefix for staging sibling files. */
export const STAGING_PREFIX = ".soulguard.";

/**
 * Compute the staging sibling path for a given file path.
 *
 * @example stagingPath("SOUL.md") → ".soulguard.SOUL.md"
 * @example stagingPath("memory/notes.md") → "memory/.soulguard.notes.md"
 */
export function stagingPath(filePath: string): string {
  const dir = dirname(filePath);
  const name = basename(filePath);
  const sibling = `${STAGING_PREFIX}${name}`;
  return dir === "." ? sibling : join(dir, sibling);
}

/**
 * Check if a path is a staging sibling file.
 */
export function isStagingPath(filePath: string): boolean {
  return basename(filePath).startsWith(STAGING_PREFIX);
}
