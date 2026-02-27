/**
 * Glob resolution for soulguard config patterns.
 *
 * Expands glob patterns (e.g. "memory/*.md", "skills/**") into concrete
 * file paths by querying the filesystem. Literal paths pass through as-is.
 */

import type { SystemOperations } from "./system-ops.js";
import type { Result, IOError } from "./types.js";
import { ok, err } from "./result.js";

/** Check if a path contains glob characters */
export function isGlob(path: string): boolean {
  return path.includes("*");
}

/** Simple glob matcher supporting * (single segment) and ** (any depth) */
export function matchGlob(pattern: string, path: string): boolean {
  const regexStr = pattern
    .split("**")
    .map((segment) =>
      segment
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${regexStr}$`).test(path);
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
): Promise<Result<string[], IOError>> {
  const files = new Set<string>();

  for (const pattern of patterns) {
    if (isGlob(pattern)) {
      const result = await ops.glob(pattern);
      if (!result.ok) {
        return err(result.error);
      }
      for (const match of result.value) {
        files.add(match);
      }
    } else {
      files.add(pattern);
    }
  }

  return ok([...files].sort());
}
