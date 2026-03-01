/**
 * Integration tests for NodeSystemOps — requires root + test users.
 *
 * Run via Docker:
 *   docker build -f packages/core/test-integration/Dockerfile -t soulguard-test .
 *   docker run --rm soulguard-test
 *
 * These tests exercise chown (which requires root) and verify the full
 * ownership pipeline: create file → chown to soulguardian → verify stat.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodeSystemOps } from "../src/system-ops-node.js";

let workspace: string;
let ops: NodeSystemOps;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "soulguard-integ-"));
  ops = new NodeSystemOps(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("NodeSystemOps integration (root + test users)", () => {
  // ── chown ───────────────────────────────────────────────────────────

  describe("chown", () => {
    test("transfers file to soulguardian:soulguard", async () => {
      await writeFile(join(workspace, "SOUL.md"), "# Soul");

      const result = await ops.chown("SOUL.md", {
        user: "soulguardian",
        group: "soulguard",
      });
      expect(result.ok).toBe(true);

      const stat = await ops.stat("SOUL.md");
      expect(stat.ok).toBe(true);
      if (!stat.ok) return;
      expect(stat.value.ownership.user).toBe("soulguardian");
      expect(stat.value.ownership.group).toBe("soulguard");
    });

    test("transfers file back to agent user", async () => {
      await writeFile(join(workspace, "notes.md"), "# Notes");

      // First transfer to soulguardian
      await ops.chown("notes.md", {
        user: "soulguardian",
        group: "soulguard",
      });

      // Then release back to agent
      const result = await ops.chown("notes.md", {
        user: "agent",
        group: "soulguard",
      });
      expect(result.ok).toBe(true);

      const stat = await ops.stat("notes.md");
      expect(stat.ok).toBe(true);
      if (!stat.ok) return;
      expect(stat.value.ownership.user).toBe("agent");
    });

    test("returns error for nonexistent file", async () => {
      const result = await ops.chown("nope.md", {
        user: "soulguardian",
        group: "soulguard",
      });
      expect(result.ok).toBe(false);
    });

    test("returns error for nonexistent user", async () => {
      await writeFile(join(workspace, "test.md"), "hello");

      const result = await ops.chown("test.md", {
        user: "nonexistent_user_xyz",
        group: "soulguard",
      });
      expect(result.ok).toBe(false);
    });
  });

  // ── Full protect workflow ─────────────────────────────────────────────

  describe("protect workflow", () => {
    test("protect → verify → release cycle", async () => {
      await writeFile(join(workspace, "SOUL.md"), "# My Soul");

      // 1. Protect: chown + chmod
      const chownResult = await ops.chown("SOUL.md", {
        user: "soulguardian",
        group: "soulguard",
      });
      expect(chownResult.ok).toBe(true);

      const chmodResult = await ops.chmod("SOUL.md", "444");
      expect(chmodResult.ok).toBe(true);

      // 2. Verify: stat shows correct ownership + mode
      const stat1 = await ops.stat("SOUL.md");
      expect(stat1.ok).toBe(true);
      if (!stat1.ok) return;
      expect(stat1.value.ownership.user).toBe("soulguardian");
      expect(stat1.value.ownership.group).toBe("soulguard");
      expect(stat1.value.ownership.mode).toBe("444");

      // 3. Content still readable
      const content = await ops.readFile("SOUL.md");
      expect(content.ok).toBe(true);
      if (!content.ok) return;
      expect(content.value).toBe("# My Soul");

      // 4. Hash still works
      const hash = await ops.hashFile("SOUL.md");
      expect(hash.ok).toBe(true);
      if (!hash.ok) return;
      expect(hash.value).toMatch(/^[a-f0-9]{64}$/);

      // 5. Release: chown back + chmod
      const releaseChown = await ops.chown("SOUL.md", {
        user: "agent",
        group: "soulguard",
      });
      expect(releaseChown.ok).toBe(true);

      const releaseChmod = await ops.chmod("SOUL.md", "644");
      expect(releaseChmod.ok).toBe(true);

      // 6. Verify released state
      const stat2 = await ops.stat("SOUL.md");
      expect(stat2.ok).toBe(true);
      if (!stat2.ok) return;
      expect(stat2.value.ownership.user).toBe("agent");
      expect(stat2.value.ownership.mode).toBe("644");
    });
  });

  // ── userExists / groupExists with real users ────────────────────────

  describe("user/group checks with test users", () => {
    test("soulguardian user exists", async () => {
      const result = await ops.userExists("soulguardian");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    test("soulguard group exists", async () => {
      const result = await ops.groupExists("soulguard");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    test("agent user exists", async () => {
      const result = await ops.userExists("agent");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });
  });
});
