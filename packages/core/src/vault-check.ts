/**
 * Check if a file path matches a vault entry.
 * For 0.1, only exact match is supported. Glob patterns are not evaluated.
 * TODO: add glob matching (*.md, extensions/**)
 */
export function isVaultedFile(vaultFiles: string[], filePath: string): boolean {
  const norm = normalizePath(filePath);
  return vaultFiles.some((pattern) => norm === normalizePath(pattern));
}

export function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  return s;
}
