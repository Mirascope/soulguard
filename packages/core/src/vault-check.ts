/**
 * Check if a file path matches a vault entry.
 * Supports exact matches and glob patterns (*, **).
 */

import { isGlob, matchGlob } from "./glob.js";

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
