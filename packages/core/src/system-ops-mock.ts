/**
 * Mock SystemOperations for testing.
 *
 * Takes a workspace root; all paths are relative (resolved internally).
 * Records all mutation operations for assertion.
 */

import { resolve } from "node:path";
import type { FileStat, SystemOperations } from "./system-ops.js";
import type { Result, NotFoundError, PermissionDeniedError, IOError } from "./types.js";
import { ok, err } from "./result.js";

/**
 * Records what the mock *did*. Intentionally parallel to SyncAction
 * (which records what sync *decided*) — they track different things.
 */
export type RecordedOp =
  | { kind: "chown"; path: string; owner: { user: string; group: string } }
  | { kind: "chmod"; path: string; mode: string };

type MockFile = {
  content: string;
  owner: string;
  group: string;
  mode: string;
};

export class MockSystemOps implements SystemOperations {
  public readonly workspace: string;
  private files: Map<string, MockFile> = new Map();
  private users: Set<string> = new Set();
  private groups: Set<string> = new Set();
  public ops: RecordedOp[] = [];

  constructor(workspace: string) {
    this.workspace = workspace;
  }

  private resolve(path: string): string {
    return resolve(this.workspace, path);
  }

  /** Add a simulated file (relative path) */
  addFile(
    path: string,
    content: string,
    opts: { owner?: string; group?: string; mode?: string } = {},
  ): void {
    this.files.set(this.resolve(path), {
      content,
      owner: opts.owner ?? "unknown",
      group: opts.group ?? "unknown",
      mode: opts.mode ?? "644",
    });
  }

  /** Add a simulated system user */
  addUser(name: string): void {
    this.users.add(name);
  }

  /** Add a simulated system group */
  addGroup(name: string): void {
    this.groups.add(name);
  }

  async userExists(name: string): Promise<Result<boolean, IOError>> {
    return ok(this.users.has(name));
  }

  async groupExists(name: string): Promise<Result<boolean, IOError>> {
    return ok(this.groups.has(name));
  }

  async stat(
    path: string,
  ): Promise<Result<FileStat, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    const file = this.files.get(full);
    if (!file) return err({ kind: "not_found", path });
    return ok({
      path,
      ownership: { user: file.owner, group: file.group, mode: file.mode },
    });
  }

  async chown(
    path: string,
    owner: { user: string; group: string },
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    const file = this.files.get(full);
    if (!file) return err({ kind: "not_found", path });
    this.ops.push({ kind: "chown", path, owner });
    file.owner = owner.user;
    file.group = owner.group;
    return ok(undefined);
  }

  async chmod(
    path: string,
    mode: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    const file = this.files.get(full);
    if (!file) return err({ kind: "not_found", path });
    this.ops.push({ kind: "chmod", path, mode });
    file.mode = mode;
    return ok(undefined);
  }

  async readFile(
    path: string,
  ): Promise<Result<string, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    const file = this.files.get(full);
    if (!file) return err({ kind: "not_found", path });
    return ok(file.content);
  }

  async createUser(name: string, _group: string): Promise<Result<void, IOError>> {
    this.users.add(name);
    return ok(undefined);
  }

  async createGroup(name: string): Promise<Result<void, IOError>> {
    this.groups.add(name);
    return ok(undefined);
  }

  async writeFile(
    path: string,
    content: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    this.files.set(full, { content, owner: "agent", group: "staff", mode: "644" });
    return ok(undefined);
  }

  async mkdir(
    path: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    // Track directory and all parent dirs as entries (mirrors recursive mkdir)
    const full = this.resolve(path);
    if (!this.files.has(full)) {
      this.files.set(full, { content: "", owner: "root", group: "root", mode: "755" });
    }
    // Also create parent directories
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      const parentFull = this.resolve(parent);
      if (!this.files.has(parentFull)) {
        this.files.set(parentFull, { content: "", owner: "root", group: "root", mode: "755" });
      }
    }
    return ok(undefined);
  }

  async copyFile(
    src: string,
    dest: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const fullSrc = this.resolve(src);
    const file = this.files.get(fullSrc);
    if (!file) return err({ kind: "not_found", path: src });
    const fullDest = this.resolve(dest);
    this.files.set(fullDest, { ...file });
    return ok(undefined);
  }

  async exists(path: string): Promise<Result<boolean, IOError>> {
    const full = this.resolve(path);
    return ok(this.files.has(full));
  }

  async deleteFile(
    path: string,
  ): Promise<Result<void, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    if (!this.files.has(full)) return err({ kind: "not_found", path });
    this.files.delete(full);
    return ok(undefined);
  }

  async hashFile(
    path: string,
  ): Promise<Result<string, NotFoundError | PermissionDeniedError | IOError>> {
    const full = this.resolve(path);
    const file = this.files.get(full);
    if (!file) return err({ kind: "not_found", path });
    const hash = new Bun.CryptoHasher("sha256");
    hash.update(file.content);
    return ok(hash.digest("hex"));
  }
}
