/**
 * SystemOperations — abstraction over OS-level file operations.
 *
 * Takes a workspace root at construction time; all paths are relative.
 * Each method declares exactly which errors it can return.
 */

import type {
  Result,
  FileOwnership,
  FileInfo,
  NotFoundError,
  PermissionDeniedError,
  IOError,
} from "./types.js";
import { ok } from "./result.js";

export type FileStat = {
  path: string;
  ownership: FileOwnership;
};

export interface SystemOperations {
  /** The workspace root this instance operates on */
  readonly workspace: string;

  /** Check if a system user exists */
  userExists(name: string): Promise<Result<boolean, IOError>>;

  /** Check if a system group exists */
  groupExists(name: string): Promise<Result<boolean, IOError>>;

  /** Create a system user (requires root) */
  createUser(name: string, group: string): Promise<Result<void, IOError>>;

  /** Create a system group (requires root) */
  createGroup(name: string): Promise<Result<void, IOError>>;

  /** Write content to a file (relative path). Creates parent dirs if needed. */
  writeFile(
    path: string,
    content: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>>;

  /** Create a directory (relative path). Creates parent dirs if needed. */
  mkdir(path: string): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>>;

  /** Copy a file (relative paths). */
  copyFile(
    src: string,
    dest: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>>;

  /** Check if a path exists (relative path) */
  exists(path: string): Promise<Result<boolean, IOError>>;

  /** Get file stat info (relative path) */
  stat(path: string): Promise<Result<FileStat, NotFoundError | PermissionDeniedError | IOError>>;

  /** Change file owner and group (relative path). Does not set mode — use chmod. */
  chown(
    path: string,
    owner: { user: string; group: string },
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>>;

  /** Change file permissions (relative path) */
  chmod(
    path: string,
    mode: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>>;

  /** Read file contents (relative path) */
  readFile(path: string): Promise<Result<string, NotFoundError | PermissionDeniedError | IOError>>;

  /** Compute SHA-256 hash of file contents (relative path) */
  hashFile(path: string): Promise<Result<string, NotFoundError | PermissionDeniedError | IOError>>;
}

/** Common error type for stat/hash operations */
type FileInfoError = NotFoundError | PermissionDeniedError | IOError;

/**
 * Get FileInfo for a relative path (stat + hash combined). DRY helper.
 */
export async function getFileInfo(
  path: string,
  ops: SystemOperations,
): Promise<Result<FileInfo, FileInfoError>> {
  const statResult = await ops.stat(path);
  if (!statResult.ok) return statResult;

  const hashResult = await ops.hashFile(path);
  if (!hashResult.ok) return hashResult;

  return ok({
    path,
    ownership: statResult.value.ownership,
    hash: hashResult.value,
  });
}
