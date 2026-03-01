/**
 * Glob resolution for soulguard config patterns.
 *
 * Expands glob patterns (e.g. "memory/*.md", "skills/**") into concrete
 * file paths by querying the filesystem. Literal paths pass through as-is.
 */

import type { SystemOperations } from "./system-ops.js";
import { isStagingPath } from "./staging.js";
import type { Result, IOError } from "./types.js";
import { ok, err } from "./result.js";

/** Check if a path contains glob characters */
export function isGlob(path: string): boolean {
  return path.includes("*");
}

/**
 * Create a compiled glob matcher supporting * (single segment) and ** (any depth).
 * Handles /**\/ matching zero or more directories (e.g. src/**\/*.ts matches src/main.ts).
 */
export function createGlobMatcher(pattern: string): (path: string) => boolean {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Step 1: normalize /**/ to a placeholder, handling edge cases
  let normalized = pattern;
  // /**/ → match zero or more directory segments (including none, consume both slashes)
  normalized = normalized.replace(/\/\*\*\//g, "<GLOBSTAR>");
  // **/ at start → match zero or more directory prefixes
  normalized = normalized.replace(/^\*\*\//, "<GLOBSTAR_PREFIX>");
  // /** at end → match everything remaining (consume the leading /)
  normalized = normalized.replace(/\/\*\*$/, "<GLOBSTAR_SUFFIX>");
  // standalone ** → match everything
  normalized = normalized.replace(/^\*\*$/, "<GLOBSTAR_ALL>");

  // Step 2: escape literals and convert single * to [^/]*
  const regexStr = normalized
    .split(/(<GLOBSTAR(?:_PREFIX|_SUFFIX|_ALL)?>)/)
    .map((part) => {
      if (part === "<GLOBSTAR>") return "/(?:.+/)?";
      if (part === "<GLOBSTAR_PREFIX>") return "(?:.+/)?";
      if (part === "<GLOBSTAR_SUFFIX>") return "(?:/.*)?";

      if (part === "<GLOBSTAR_ALL>") return ".*";
      return part.split("*").map(escape).join("[^/]*");
    })
    .join("");

  const regex = new RegExp(`^${regexStr}$`);
  return (path: string) => regex.test(path);
}

/** Simple glob matcher supporting * (single segment) and ** (any depth) */
export function matchGlob(pattern: string, path: string): boolean {
  return createGlobMatcher(pattern)(path);
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
        // Skip staging siblings — they're soulguard internals, not user files
        if (isStagingPath(match)) continue;
        const statResult = await ops.stat(match);
        if (statResult.ok && !statResult.value.isDirectory) {
          files.add(match);
        }
      }
    } else {
      files.add(pattern);
    }
  }

  return ok([...files].sort());
}
