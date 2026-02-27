/**
 * Glob resolution for soulguard config patterns.
 *
 * Expands glob patterns (e.g. "memory/*.md", "skills/**") into concrete
 * file paths by querying the filesystem. Literal paths pass through as-is.
 */

import type { SystemOperations } from "./system-ops.js";

/** Check if a path contains glob characters */
export function isGlob(path: string): boolean {
  return path.includes("*");
}

/**
 * Resolve a list of paths/patterns into concrete file paths.
 * Literal paths are included as-is (even if they don't exist on disk).
 * Glob patterns are expanded against the filesystem.
 * Returns deduplicated, sorted results.
 */
export async function resolvePatterns(
  ops: SystemOperations,
  patterns: string[],
): Promise<string[]> {
  const files = new Set<string>();

  for (const pattern of patterns) {
    if (isGlob(pattern)) {
      const result = await ops.glob(pattern);
      if (result.ok) {
        for (const match of result.value) {
          files.add(match);
        }
      }
      // Glob errors are swallowed — pattern just expands to nothing
    } else {
      files.add(pattern);
    }
  }

  return [...files].sort();
}
