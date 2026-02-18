/**
 * NodeSystemOps — real OS-level file operations via Node.js APIs.
 *
 * Takes a workspace root; all paths are relative and validated
 * against traversal. Maps errno codes to typed Result errors.
 */

import { resolve, relative, dirname } from "node:path";
import {
  stat as fsStat,
  readFile,
  chmod as fsChmod,
  writeFile as fsWriteFile,
  mkdir as fsMkdir,
  copyFile as fsCopyFile,
  access,
} from "node:fs/promises";
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

  async createUser(name: string, group: string): Promise<Result<void, IOError>> {
    try {
      if (process.platform === "darwin") {
        // macOS: use dscl — PrimaryGroupID requires numeric GID
        const { stdout: gidOutput } = await execFileAsync("dscl", [
          ".",
          "-read",
          `/Groups/${group}`,
          "PrimaryGroupID",
        ]);
        const gid = gidOutput.trim().split(/\s+/).pop();
        if (!gid || !/^\d+$/.test(gid)) {
          return err({ kind: "io_error", path: `/Groups/${group}`, message: `Could not resolve GID for group ${group}` });
        }
        await execFileAsync("dscl", [".", "-create", `/Users/${name}`]);
        await execFileAsync("dscl", [".", "-create", `/Users/${name}`, "PrimaryGroupID", gid]);
        await execFileAsync("dscl", [
          ".",
          "-create",
          `/Users/${name}`,
          "UserShell",
          "/usr/bin/false",
        ]);
      } else {
        await execFileAsync("useradd", ["-r", "-g", group, "-s", "/usr/bin/false", name]);
      }
      return ok(undefined);
    } catch (e) {
      return err({
        kind: "io_error",
        path: "",
        message: `createUser ${name}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async createGroup(name: string): Promise<Result<void, IOError>> {
    try {
      if (process.platform === "darwin") {
        await execFileAsync("dscl", [".", "-create", `/Groups/${name}`]);
      } else {
        await execFileAsync("groupadd", [name]);
      }
      return ok(undefined);
    } catch (e) {
      return err({
        kind: "io_error",
        path: "",
        message: `createGroup ${name}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async writeFile(
    path: string,
    content: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;
    try {
      await fsMkdir(dirname(resolved.value), { recursive: true });
      await fsWriteFile(resolved.value, content, "utf-8");
      return ok(undefined);
    } catch (e) {
      return err(mapError(e, path, "writeFile"));
    }
  }

  async mkdir(
    path: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return resolved;
    try {
      await fsMkdir(resolved.value, { recursive: true });
      return ok(undefined);
    } catch (e) {
      return err(mapError(e, path, "mkdir"));
    }
  }

  async copyFile(
    src: string,
    dest: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const resolvedSrc = this.resolvePath(src);
    if (!resolvedSrc.ok) return resolvedSrc;
    const resolvedDest = this.resolvePath(dest);
    if (!resolvedDest.ok) return resolvedDest;
    try {
      await fsMkdir(dirname(resolvedDest.value), { recursive: true });
      await fsCopyFile(resolvedSrc.value, resolvedDest.value);
      return ok(undefined);
    } catch (e) {
      return err(mapError(e, src, "copyFile"));
    }
  }

  async exists(path: string): Promise<Result<boolean, IOError>> {
    const resolved = this.resolvePath(path);
    if (!resolved.ok) return ok(false);
    try {
      await access(resolved.value);
      return ok(true);
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        return ok(false);
      }
      return err({
        kind: "io_error",
        path,
        message: `exists: ${e instanceof Error ? e.message : String(e)}`,
      });
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

/**
 * Check if an absolute path exists (outside any workspace).
 * Deliberately NOT on SystemOperations.
 */
export async function existsAbsolute(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write to an absolute path (outside any workspace).
 * Deliberately NOT on SystemOperations — used only for init's sudoers writing.
 */
export async function writeFileAbsolute(
  path: string,
  content: string,
): Promise<Result<void, IOError>> {
  try {
    await fsMkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, content, "utf-8");
    return ok(undefined);
  } catch (e) {
    return err({
      kind: "io_error",
      path,
      message: `writeFileAbsolute: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
