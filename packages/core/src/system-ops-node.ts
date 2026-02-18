/**
 * NodeSystemOps — real OS-level file operations via Node.js APIs.
 *
 * Takes a workspace root; all paths are relative and validated
 * against traversal. Maps errno codes to typed Result errors.
 */

import { resolve, relative } from "node:path";
import { stat as fsStat, readFile, chmod as fsChmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FileStat, SystemOperations } from "./system-ops.js";
import type { IOError, NotFoundError, PermissionDeniedError, Result } from "./types.js";
import { ok, err } from "./result.js";

const execFileAsync = promisify(execFile);

type FileError = NotFoundError | PermissionDeniedError | IOError;

/** Map Node.js errno to our typed errors */
function mapError(e: unknown, path: string, operation: string): FileError {
  if (e instanceof Error && "code" in e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "not_found", path };
    if (code === "EACCES" || code === "EPERM") {
      return { kind: "permission_denied", path, operation };
    }
  }
  const message = e instanceof Error ? e.message : String(e);
  return { kind: "io_error", path, message };
}

/** Look up username for a uid via `id -un` (works on macOS + Linux) */
async function uidToName(uid: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync("id", ["-un", String(uid)]);
    return stdout.trim();
  } catch {
    return String(uid);
  }
}

/** Look up group name for a gid */
async function gidToName(gid: number): Promise<string> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      // macOS: dscl lookup
      const { stdout } = await execFileAsync("dscl", [
        ".",
        "-search",
        "/Groups",
        "PrimaryGroupID",
        String(gid),
      ]);
      const match = stdout.match(/^(\S+)/);
      return match?.[1] ?? String(gid);
    } else {
      // Linux: getent
      const { stdout } = await execFileAsync("getent", ["group", String(gid)]);
      const name = stdout.split(":")[0];
      return name || String(gid);
    }
  } catch {
    return String(gid);
  }
}

/** Convert octal mode to 3-digit string (e.g. 0o100444 → "444") */
function modeToString(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, "0");
}

export class NodeSystemOps implements SystemOperations {
  public readonly workspace: string;

  constructor(workspace: string) {
    this.workspace = resolve(workspace);
  }

  /** Resolve a relative path, rejecting traversal outside workspace */
  private resolvePath(path: string): Result<string, IOError> {
    const full = resolve(this.workspace, path);
    const rel = relative(this.workspace, full);
    if (rel.startsWith("..")) {
      return err({
        kind: "io_error",
        path,
        message: "Path traversal outside workspace",
      });
    }
    return ok(full);
  }

  async userExists(name: string): Promise<Result<boolean, IOError>> {
    try {
      await execFileAsync("id", ["-u", name]);
      return ok(true);
    } catch (e: unknown) {
      // `id` exits non-zero for unknown users — that's expected
      if (e instanceof Error && "code" in e && typeof (e as any).code === "number") {
        return ok(false);
      }
      const message = e instanceof Error ? e.message : String(e);
      return err({ kind: "io_error", path: "", message: `userExists(${name}): ${message}` });
    }
  }

  async groupExists(name: string): Promise<Result<boolean, IOError>> {
    try {
      if (process.platform === "darwin") {
        await execFileAsync("dscl", [".", "-read", `/Groups/${name}`, "PrimaryGroupID"]);
      } else {
        await execFileAsync("getent", ["group", name]);
      }
      return ok(true);
    } catch (e: unknown) {
      // Non-zero exit = group not found (expected)
      if (e instanceof Error && "code" in e && typeof (e as any).code === "number") {
        return ok(false);
      }
      const message = e instanceof Error ? e.message : String(e);
      return err({ kind: "io_error", path: "", message: `groupExists(${name}): ${message}` });
    }
  }

  async stat(path: string): Promise<Result<FileStat, FileError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;

    try {
      const s = await fsStat(resolved.value);
      const [user, group] = await Promise.all([uidToName(s.uid), gidToName(s.gid)]);

      return ok({
        path,
        ownership: { user, group, mode: modeToString(s.mode) },
      });
    } catch (e) {
      return err(mapError(e, path, "stat"));
    }
  }

  async chown(
    path: string,
    owner: { user: string; group: string },
  ): Promise<Result<void, FileError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;

    try {
      await execFileAsync("chown", [`${owner.user}:${owner.group}`, resolved.value]);
      return ok(undefined);
    } catch (e) {
      return err(mapError(e, path, "chown"));
    }
  }

  async chmod(path: string, mode: string): Promise<Result<void, FileError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;

    try {
      await fsChmod(resolved.value, parseInt(mode, 8));
      return ok(undefined);
    } catch (e) {
      return err(mapError(e, path, "chmod"));
    }
  }

  async readFile(path: string): Promise<Result<string, FileError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;

    try {
      const content = await readFile(resolved.value, "utf-8");
      return ok(content);
    } catch (e) {
      return err(mapError(e, path, "readFile"));
    }
  }

  async hashFile(path: string): Promise<Result<string, FileError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;

    return new Promise((resolve) => {
      const hash = createHash("sha256");
      const stream = createReadStream(resolved.value);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(ok(hash.digest("hex"))));
      stream.on("error", (e) => resolve(err(mapError(e, path, "hashFile"))));
    });
  }
}
