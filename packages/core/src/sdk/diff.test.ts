import { describe, expect, test } from "bun:test";
import { diff } from "./diff.js";
import { StateTree } from "./state.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import type { SoulguardConfig, Tier } from "../util/types.js";
import { DELETE_SENTINEL } from "./staging.js";

const WORKSPACE = "/test/workspace";
const GUARDIAN = "soulguardian_agent";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(protect: string[] = ["SOUL.md"]): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of protect) files[p] = "protect";
  return { version: 1, guardian: GUARDIAN, files };
}

describe("diff", () => {
  test("no changes → empty files, hasChanges false", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Soul");

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(false);
    expect(result.value.files).toHaveLength(0);
  });

  test("modified file → shows diff, hasChanges true", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul\noriginal");
    ops.addFile(".soulguard-staging/SOUL.md", "# Soul\nmodified");

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.file.status).toBe("modified");
    expect(result.value.files[0]!.diff).toContain("-original");
    expect(result.value.files[0]!.diff).toContain("+modified");
  });

  test("protected file exists but staging has DELETE_SENTINEL → deleted status", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.file.status).toBe("deleted");
    expect(result.value.files[0]!.file.canonicalHash).toBeDefined();
    expect(result.value.approvalHash).toBeDefined();
  });

  test("neither protected file nor staging exists → no files, no changes", async () => {
    const ops = makeMock();

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(0);
    expect(result.value.hasChanges).toBe(false);
  });

  test("protected file missing → created status", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard-staging/SOUL.md", "# New Soul");

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.file.status).toBe("created");
  });

  test("specific files filter works", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Soul modified");
    ops.addFile("AGENTS.md", "# Agents");
    ops.addFile(".soulguard-staging/AGENTS.md", "# Agents modified");

    const config = makeConfig(["SOUL.md", "AGENTS.md"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops, files: ["SOUL.md"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.file.path).toBe("SOUL.md");
  });

  test("multiple literal files", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard-staging/SOUL.md", "modified");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile(".soulguard-staging/memory/day1.md", "modified notes");

    const config = makeConfig(["SOUL.md", "memory/day1.md"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(2);
    expect(result.value.files.map((f) => f.file.path)).toContain("SOUL.md");
    expect(result.value.files.map((f) => f.file.path)).toContain("memory/day1.md");
  });

  test("approvalHash is present when changes exist", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard-staging/SOUL.md", "modified");

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.approvalHash).toBeDefined();
    expect(typeof result.value.approvalHash).toBe("string");
    expect(result.value.approvalHash!.length).toBe(64);
  });

  test("approvalHash is undefined when no changes", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "same");
    ops.addFile(".soulguard-staging/SOUL.md", "same");

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.approvalHash).toBeUndefined();
  });

  test("approvalHash is deterministic", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard-staging/SOUL.md", "modified");

    const config = makeConfig();
    const t1 = await StateTree.buildOrThrow({ ops, config });
    const r1 = await diff({ tree: t1, ops });
    const t2 = await StateTree.buildOrThrow({ ops, config });
    const r2 = await diff({ tree: t2, ops });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.approvalHash).toBe(r2.value.approvalHash);
    }
  });

  test("approvalHash changes when staging content changes", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original");
    ops.addFile(".soulguard-staging/SOUL.md", "modified-v1");

    const config = makeConfig();
    const t1 = await StateTree.buildOrThrow({ ops, config });
    const r1 = await diff({ tree: t1, ops });

    ops.addFile(".soulguard-staging/SOUL.md", "modified-v2");
    const t2 = await StateTree.buildOrThrow({ ops, config });
    const r2 = await diff({ tree: t2, ops });

    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.approvalHash).not.toBe(r2.value.approvalHash);
    }
  });

  // ── Delete sentinel tests ─────────────────────────────────────────

  test("file with delete sentinel in staging → deleted status", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.file.status).toBe("deleted");
  });

  // ── Directory tests ───────────────────────────────────────────────

  test("directory: no staging → no changes", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "notes");

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(false);
    expect(result.value.files).toHaveLength(0);
  });

  test("directory: modified file in staging → shows diff", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "original notes");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "modified notes");

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.file.path).toBe("memory/day1.md");
    expect(result.value.files[0]!.file.status).toBe("modified");
    expect(result.value.files[0]!.diff).toContain("-original notes");
    expect(result.value.files[0]!.diff).toContain("+modified notes");
  });

  test("directory: unchanged files are skipped", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "same notes");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "same notes");

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(false);
    expect(result.value.files).toHaveLength(0);
  });

  test("directory: new file in staging → created", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "notes");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "notes");
    ops.addFile(".soulguard-staging/memory/day2.md", "new notes");

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    const newFile = result.value.files.find((f) => f.file.path === "memory/day2.md");
    expect(newFile).toBeDefined();
    expect(newFile!.file.status).toBe("created");
  });

  test("directory: file has DELETE_SENTINEL in staging → deleted status", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile("memory/day2.md", "more notes");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "notes");
    ops.addFile(".soulguard-staging/memory/day2.md", JSON.stringify(DELETE_SENTINEL));

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    const deleted = result.value.files.find((f) => f.file.path === "memory/day2.md");
    expect(deleted).toBeDefined();
    expect(deleted!.file.status).toBe("deleted");
  });

  test("directory: delete sentinel on staging dir → deletes all files", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile("memory/day2.md", "more notes");
    ops.addFile(".soulguard-staging/memory", JSON.stringify(DELETE_SENTINEL));

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files).toHaveLength(2);
    expect(result.value.files.every((f) => f.file.status === "deleted")).toBe(true);
  });

  test("directory: delete sentinel on individual file within dir", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile("memory/day2.md", "more notes");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "notes");
    ops.addFile(".soulguard-staging/memory/day2.md", JSON.stringify(DELETE_SENTINEL));

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    const deleted = result.value.files.find((f) => f.file.path === "memory/day2.md");
    expect(deleted).toBeDefined();
    expect(deleted!.file.status).toBe("deleted");
    expect(result.value.files.find((f) => f.file.path === "memory/day1.md")).toBeUndefined();
  });

  test("directory: approval hash includes individual file paths", async () => {
    const ops = makeMock();
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "original");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "modified");

    const config = makeConfig(["memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.approvalHash).toBeDefined();
    expect(result.value.approvalHash!.length).toBe(64);
  });

  test("directory: mixed with file entries", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Soul modified");
    ops.addDirectory("memory/");
    ops.addFile("memory/day1.md", "notes");
    ops.addDirectory(".soulguard-staging/memory");
    ops.addFile(".soulguard-staging/memory/day1.md", "modified notes");

    const config = makeConfig(["SOUL.md", "memory/"]);
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await diff({ tree, ops });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files).toHaveLength(2);
    expect(result.value.files.find((f) => f.file.path === "SOUL.md")!.file.status).toBe("modified");
    expect(result.value.files.find((f) => f.file.path === "memory/day1.md")!.file.status).toBe(
      "modified",
    );
  });
});
