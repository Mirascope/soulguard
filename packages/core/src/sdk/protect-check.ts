/**
 * Check if a file path matches a protected entry.
 * Literal path comparison only (no globs).
 */

export function isProtectedFile(protectFiles: string[], filePath: string): boolean {
  const norm = normalizePath(filePath);
  return protectFiles.some((entry) => {
    const normEntry = normalizePath(entry);
    // Exact match or file is inside a protected directory
    return norm === normEntry || norm.startsWith(normEntry + "/");
  });
}

export function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  // Remove trailing slash for directory paths
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
