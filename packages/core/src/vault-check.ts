/**
 * Check if a file path matches a vault entry.
 * Supports exact matches and glob patterns (*, **).
 */

import { isGlob } from "./glob.js";

export function isVaultedFile(vaultFiles: string[], filePath: string): boolean {
  const norm = normalizePath(filePath);
  return vaultFiles.some((pattern) => {
    const normPattern = normalizePath(pattern);
    if (isGlob(normPattern)) {
      return matchGlob(normPattern, norm);
    }
    return norm === normPattern;
  });
}

export function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  return s;
}

/** Simple glob matcher supporting * (single segment) and ** (any depth) */
function matchGlob(pattern: string, path: string): boolean {
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
