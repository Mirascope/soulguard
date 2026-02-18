/**
 * Tests for NodeSystemOps — local tests that don't require root.
 *
 * Tests stat, readFile, hashFile, chmod (on own files), userExists, groupExists.
 * chown tests require root and live in the Docker integration suite.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { NodeSystemOps } from "./system-ops-node.js";

let workspace: string;
let ops: NodeSystemOps;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "soulguard-test-"));
  ops = new NodeSystemOps(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("NodeSystemOps", () => {
  // ── stat ────────────────────────────────────────────────────────────

  describe("stat", () => {
    test("returns ownership info for existing file", async () => {
      await writeFile(join(workspace, "test.md"), "hello");

      const result = await ops.stat("test.md");
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.path).toBe("test.md");
      expect(result.value.ownership.user).toBeTruthy();
      expect(result.value.ownership.group).toBeTruthy();
      expect(result.value.ownership.mode).toMatch(/^\d{3}$/);
    });

    test("returns not_found for missing file", async () => {
      const result = await ops.stat("nope.md");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("not_found");
    });

    test("rejects path traversal", async () => {
      const result = await ops.stat("../../etc/passwd");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("io_error");
    });

    test("handles nested paths", async () => {
      await mkdir(join(workspace, "sub"), { recursive: true });
      await writeFile(join(workspace, "sub", "nested.md"), "deep");

      const result = await ops.stat("sub/nested.md");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.path).toBe("sub/nested.md");
    });
  });

  // ── readFile ────────────────────────────────────────────────────────

  describe("readFile", () => {
    test("reads file contents", async () => {
      await writeFile(join(workspace, "test.md"), "hello world");

      const result = await ops.readFile("test.md");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe("hello world");
    });

    test("returns not_found for missing file", async () => {
      const result = await ops.readFile("nope.md");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("not_found");
    });

    test("rejects path traversal", async () => {
      const result = await ops.readFile("../../etc/passwd");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("io_error");
    });
  });

  // ── hashFile ────────────────────────────────────────────────────────

  describe("hashFile", () => {
    test("returns correct SHA-256 hash", async () => {
      const content = "hello world";
      await writeFile(join(workspace, "test.md"), content);

      const expected = createHash("sha256").update(content).digest("hex");

      const result = await ops.hashFile("test.md");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(expected);
    });

    test("returns not_found for missing file", async () => {
      const result = await ops.hashFile("nope.md");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("not_found");
    });
  });

  // ── chmod ───────────────────────────────────────────────────────────

  describe("chmod", () => {
    test("changes file permissions", async () => {
      await writeFile(join(workspace, "test.md"), "hello");

      const result = await ops.chmod("test.md", "444");
      expect(result.ok).toBe(true);

      const stat = await ops.stat("test.md");
      expect(stat.ok).toBe(true);
      if (!stat.ok) return;
      expect(stat.value.ownership.mode).toBe("444");

      // Restore so cleanup works
      await ops.chmod("test.md", "644");
    });

    test("returns not_found for missing file", async () => {
      const result = await ops.chmod("nope.md", "444");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("not_found");
    });
  });

  // ── userExists ──────────────────────────────────────────────────────

  describe("userExists", () => {
    test("returns true for current user", async () => {
      const currentUser = process.env.USER ?? "root";
      const result = await ops.userExists(currentUser);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    test("returns false for nonexistent user", async () => {
      const result = await ops.userExists("soulguard_nonexistent_user_xyz");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });
  });

  // ── groupExists ─────────────────────────────────────────────────────

  describe("groupExists", () => {
    test("returns true for staff group", async () => {
      // 'staff' exists on macOS, 'root' on Linux
      const group = process.platform === "darwin" ? "staff" : "root";
      const result = await ops.groupExists(group);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    test("returns false for nonexistent group", async () => {
      const result = await ops.groupExists("soulguard_nonexistent_group_xyz");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });
  });
});
