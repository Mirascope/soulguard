import { describe, expect, test } from "bun:test";
import { diff } from "./diff.js";
import { MockSystemOps } from "./system-ops-mock.js";
import type { SoulguardConfig, Tier } from "./types.js";

const WORKSPACE = "/test/workspace";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(protect: string[] = ["SOUL.md"]): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of protect) files[p] = "protect";
  return { version: 1, files };
}

describe("diff", () => {
  test("no changes → all unchanged, hasChanges false", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard.SOUL.md", "# Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(false);
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.status).toBe("unchanged");
  });

  test("modified file → shows diff, hasChanges true", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "# Soul\noriginal");
    ops.addFile(".soulguard.SOUL.md", "# Soul\nmodified");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.status).toBe("modified");
    expect(result.value.files[0]!.diff).toContain("-original");
    expect(result.value.files[0]!.diff).toContain("+modified");
  });

  test("protect-tier file exists but staging deleted → deleted status", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "# Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.status).toBe("deleted");
    expect(result.value.files[0]!.protectedHash).toBeDefined();
    expect(result.value.approvalHash).toBeDefined();
  });

  test("neither protect-tier file nor staging exists → staging_missing status", async () => {
    const ops = makeMock();

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files[0]!.status).toBe("staging_missing");
  });

  test("protect-tier file missing → protect_missing status", async () => {
    const ops = makeMock();

    ops.addFile(".soulguard.SOUL.md", "# New Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.status).toBe("protect_missing");
  });

  test("specific files filter works", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard.SOUL.md", "# Soul");
    ops.addFile("AGENTS.md", "# Agents");
    ops.addFile(".soulguard.AGENTS.md", "# Agents modified");

    const config = makeConfig(["SOUL.md", "AGENTS.md"]);
    const result = await diff({ ops, config, files: ["SOUL.md"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.path).toBe("SOUL.md");
  });

  test("globs resolve to matching files", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard.SOUL.md", "# Soul");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile("memory/.soulguard.day1.md", "notes");

    const config = makeConfig(["SOUL.md", "memory/**"]);
    const result = await diff({ ops, config });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(2);
    expect(result.value.files.map((f) => f.path)).toContain("SOUL.md");
    expect(result.value.files.map((f) => f.path)).toContain("memory/day1.md");
  });

  test("approvalHash is present when changes exist", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard.SOUL.md", "modified");

    const result = await diff({ ops, config: makeConfig() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.approvalHash).toBeDefined();
    expect(typeof result.value.approvalHash).toBe("string");
    expect(result.value.approvalHash!.length).toBe(64); // SHA-256 hex
  });

  test("approvalHash is undefined when no changes", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "same");
    ops.addFile(".soulguard.SOUL.md", "same");

    const result = await diff({ ops, config: makeConfig() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.approvalHash).toBeUndefined();
  });

  test("approvalHash is deterministic", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard.SOUL.md", "modified");

    const r1 = await diff({ ops, config: makeConfig() });
    const r2 = await diff({ ops, config: makeConfig() });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.approvalHash).toBe(r2.value.approvalHash);
    }
  });

  test("approvalHash changes when staging content changes", async () => {
    const ops = makeMock();

    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard.SOUL.md", "modified-v1");

    const r1 = await diff({ ops, config: makeConfig() });

    ops.addFile(".soulguard.SOUL.md", "modified-v2");
    const r2 = await diff({ ops, config: makeConfig() });

    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.approvalHash).not.toBe(r2.value.approvalHash);
    }
  });
});
