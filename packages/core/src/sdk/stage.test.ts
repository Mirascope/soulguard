import { describe, expect, test } from "bun:test";
import { stage } from "./stage.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import type { SoulguardConfig, Tier } from "../util/types.js";
import { DELETE_SENTINEL, isDeleteSentinel } from "./staging.js";

const WORKSPACE = "/test/workspace";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(protect: string[] = ["SOUL.md"]): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of protect) files[p] = "protect";
  return { version: 1, files };
}

describe("stage", () => {
  // ── Basic file operations ─────────────────────────────────────────

  test("stage existing file for editing → copies to staging", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const result = await stage({ ops, config: makeConfig(), path: "SOUL.md" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([{ path: "SOUL.md", action: "edit" }]);

    const staged = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe("# Soul");
    }
  });

  test("stage file for deletion → writes DELETE_SENTINEL", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const result = await stage({ ops, config: makeConfig(), path: "SOUL.md", delete: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([{ path: "SOUL.md", action: "delete" }]);

    const staged = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe(JSON.stringify(DELETE_SENTINEL, null, 2));
    }
  });

  test("already staged file → returns empty stagedFiles", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Soul");

    const result = await stage({ ops, config: makeConfig(), path: "SOUL.md" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([]);
  });

  test("nested file paths → creates parent directories", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");

    const config = makeConfig(["memory/notes.md"]);
    const result = await stage({ ops, config, path: "memory/notes.md" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([{ path: "memory/notes.md", action: "edit" }]);

    const staged = await ops.readFile(".soulguard-staging/memory/notes.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe("notes");
    }
  });

  // ── Directory operations ──────────────────────────────────────────

  test("stage protected directory for editing → recursively stages all files", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes content");
    ops.addFile("memory/ideas.md", "ideas content");
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);
    const result = await stage({ ops, config, path: "memory" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toHaveLength(2);
    expect(result.value.stagedFiles).toContainEqual({
      path: "memory/notes.md",
      action: "edit",
    });
    expect(result.value.stagedFiles).toContainEqual({
      path: "memory/ideas.md",
      action: "edit",
    });

    const notes = await ops.readFile(".soulguard-staging/memory/notes.md");
    const ideas = await ops.readFile(".soulguard-staging/memory/ideas.md");
    expect(notes.ok && notes.value).toBe("notes content");
    expect(ideas.ok && ideas.value).toBe("ideas content");
  });

  test("stage protected directory for deletion → writes DELETE_SENTINEL as file", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);
    const result = await stage({ ops, config, path: "memory", delete: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([{ path: "memory", action: "delete" }]);

    // Should be a file (not directory) containing DELETE_SENTINEL
    const staged = await ops.readFile(".soulguard-staging/memory");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe(JSON.stringify(DELETE_SENTINEL, null, 2));
    }
  });

  test("stage already-staged directory → skips already-staged files", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");
    ops.addFile("memory/ideas.md", "ideas");
    ops.addFile(".soulguard-staging/memory/notes.md", "notes"); // Already staged
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);
    const result = await stage({ ops, config, path: "memory" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should only stage ideas.md (notes.md was skipped)
    expect(result.value.stagedFiles).toEqual([{ path: "memory/ideas.md", action: "edit" }]);
  });

  test("empty directory → no files in stagedFiles", async () => {
    const ops = makeMock();
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);
    const result = await stage({ ops, config, path: "memory" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([]);
  });

  test("stage directory with nested subdirectories → recursively stages all files", async () => {
    const ops = makeMock();
    ops.addFile("memory/2024/january.md", "january notes");
    ops.addFile("memory/2024/february.md", "february notes");
    ops.addFile("memory/ideas.md", "ideas");
    ops.addDirectory("memory");
    ops.addDirectory("memory/2024");

    const config = makeConfig(["memory"]);
    const result = await stage({ ops, config, path: "memory" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toHaveLength(3);
    expect(result.value.stagedFiles).toContainEqual({
      path: "memory/2024/january.md",
      action: "edit",
    });
    expect(result.value.stagedFiles).toContainEqual({
      path: "memory/2024/february.md",
      action: "edit",
    });
    expect(result.value.stagedFiles).toContainEqual({
      path: "memory/ideas.md",
      action: "edit",
    });

    // Verify all files were actually staged
    const jan = await ops.readFile(".soulguard-staging/memory/2024/january.md");
    const feb = await ops.readFile(".soulguard-staging/memory/2024/february.md");
    const ideas = await ops.readFile(".soulguard-staging/memory/ideas.md");
    expect(jan.ok && jan.value).toBe("january notes");
    expect(feb.ok && feb.value).toBe("february notes");
    expect(ideas.ok && ideas.value).toBe("ideas");
  });

  // ── Files in protected directories ────────────────────────────────

  test("stage existing file in protected directory → succeeds", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]); // memory/ is protected
    const result = await stage({ ops, config, path: "memory/notes.md" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([{ path: "memory/notes.md", action: "edit" }]);

    const staged = await ops.readFile(".soulguard-staging/memory/notes.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe("notes");
    }
  });

  test("stage non-existent file in protected directory → creates empty staging file", async () => {
    const ops = makeMock();
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]); // memory/ is protected
    const result = await stage({ ops, config, path: "memory/new-thought.md" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stagedFiles).toEqual([{ path: "memory/new-thought.md", action: "edit" }]);

    const staged = await ops.readFile(".soulguard-staging/memory/new-thought.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe("");
    }
  });

  test("stage non-existent file NOT in protected directory → error not_in_protect_tier", async () => {
    const ops = makeMock();

    const config = makeConfig(["SOUL.md"]);
    const result = await stage({ ops, config, path: "random-file.md" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("not_in_protect_tier");
    expect(result.error.path).toBe("random-file.md");
  });

  // ── Error cases ───────────────────────────────────────────────────

  test("path not in protect tier → error not_in_protect_tier", async () => {
    const ops = makeMock();
    ops.addFile("README.md", "# Readme");

    const config = makeConfig(["SOUL.md"]);
    const result = await stage({ ops, config, path: "README.md" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("not_in_protect_tier");
    expect(result.error.path).toBe("README.md");
  });

  test("stat permission error → returns stage_failed", async () => {
    const ops = makeMock();
    // Add file but make stat fail with permission denied
    ops.addFile("SOUL.md", "# Soul", { owner: "root", group: "root", mode: "000" });

    // Mock stat to fail with permission_denied
    const originalStat = ops.stat.bind(ops);
    ops.stat = async (path: string) => {
      if (path === "SOUL.md") {
        return {
          ok: false,
          error: { kind: "permission_denied" as const, path, operation: "stat" },
        };
      }
      return originalStat(path);
    };

    const result = await stage({ ops, config: makeConfig(), path: "SOUL.md" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("stage_failed");
    expect(result.error.path).toBe("SOUL.md");
    if (result.error.kind === "stage_failed") {
      expect(result.error.message).toContain("Cannot stat path");
    }
  });

  test("copyFile failure → returns stage_failed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    // Mock copyFile to fail
    const originalCopy = ops.copyFile.bind(ops);
    ops.copyFile = async (src: string, dest: string) => {
      if (src === "SOUL.md") {
        return {
          ok: false,
          error: { kind: "permission_denied" as const, path: src, operation: "copy" },
        };
      }
      return originalCopy(src, dest);
    };

    const result = await stage({ ops, config: makeConfig(), path: "SOUL.md" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("stage_failed");
    expect(result.error.path).toBe("SOUL.md");
    if (result.error.kind === "stage_failed") {
      expect(result.error.message).toContain("Cannot copy file");
    }
  });

  test("writeFile failure for new file → returns stage_failed", async () => {
    const ops = makeMock();
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);

    // Mock writeFile to fail
    const originalWrite = ops.writeFile.bind(ops);
    ops.writeFile = async (path: string, content: string) => {
      if (path === ".soulguard-staging/memory/new-file.md") {
        return {
          ok: false,
          error: { kind: "permission_denied" as const, path, operation: "write" },
        };
      }
      return originalWrite(path, content);
    };

    const result = await stage({ ops, config, path: "memory/new-file.md" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("stage_failed");
    if (result.error.kind === "stage_failed") {
      expect(result.error.message).toContain("Cannot create empty staging file");
    }
  });

  test("writeFile failure for DELETE_SENTINEL → returns stage_failed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    // Mock writeFile to fail
    const originalWrite = ops.writeFile.bind(ops);
    ops.writeFile = async (path: string, content: string) => {
      if (path === ".soulguard-staging/SOUL.md") {
        return {
          ok: false,
          error: { kind: "permission_denied" as const, path, operation: "write" },
        };
      }
      return originalWrite(path, content);
    };

    const result = await stage({ ops, config: makeConfig(), path: "SOUL.md", delete: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("stage_failed");
    if (result.error.kind === "stage_failed") {
      expect(result.error.message).toContain("Cannot write delete sentinel");
    }
  });

  test("listDir failure → returns stage_failed", async () => {
    const ops = makeMock();
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);

    // Mock listDir to fail
    const originalList = ops.listDir.bind(ops);
    ops.listDir = async (path: string) => {
      if (path === "memory") {
        return {
          ok: false,
          error: { kind: "permission_denied" as const, path, operation: "list" },
        };
      }
      return originalList(path);
    };

    const result = await stage({ ops, config, path: "memory" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("stage_failed");
    if (result.error.kind === "stage_failed") {
      expect(result.error.message).toContain("Cannot list directory");
    }
  });

  test("mkdir failure → returns stage_failed", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");

    const config = makeConfig(["memory/notes.md"]);

    // Mock mkdir to fail
    const originalMkdir = ops.mkdir.bind(ops);
    ops.mkdir = async (path: string) => {
      if (path === ".soulguard-staging/memory") {
        return {
          ok: false,
          error: { kind: "permission_denied" as const, path, operation: "mkdir" },
        };
      }
      return originalMkdir(path);
    };

    const result = await stage({ ops, config, path: "memory/notes.md" });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("stage_failed");
    if (result.error.kind === "stage_failed") {
      expect(result.error.message).toContain("Cannot create parent directory");
    }
  });

  // ── Sentinel overwrite cases ──────────────────────────────────────

  test("stage file for editing when DELETE_SENTINEL exists → overwrites sentinel", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const config = makeConfig();

    // First stage for deletion
    const deleteResult = await stage({ ops, config, path: "SOUL.md", delete: true });
    expect(deleteResult.ok).toBe(true);

    // Then stage for editing (should overwrite)
    const editResult = await stage({ ops, config, path: "SOUL.md" });

    expect(editResult.ok).toBe(true);
    if (!editResult.ok) return;

    // Should stage the file for editing
    expect(editResult.value.stagedFiles).toEqual([{ path: "SOUL.md", action: "edit" }]);

    // Verify the sentinel was overwritten with file content
    const staged = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe("# Soul");
    }
  });

  test("stage file for deletion when already staged for editing → overwrites with sentinel", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const config = makeConfig();

    // First stage for editing
    const editResult = await stage({ ops, config, path: "SOUL.md" });
    expect(editResult.ok).toBe(true);

    // Then stage for deletion (should overwrite)
    const deleteResult = await stage({ ops, config, path: "SOUL.md", delete: true });

    expect(deleteResult.ok).toBe(true);
    if (!deleteResult.ok) return;

    // Should stage the file for deletion
    expect(deleteResult.value.stagedFiles).toEqual([{ path: "SOUL.md", action: "delete" }]);

    // Verify file was overwritten with sentinel
    const staged = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe(JSON.stringify(DELETE_SENTINEL, null, 2));
    }
  });

  test("stage file for deletion when already staged for deletion → skips", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const config = makeConfig();

    // First stage for deletion
    const firstDelete = await stage({ ops, config, path: "SOUL.md", delete: true });
    expect(firstDelete.ok).toBe(true);

    // Try to stage for deletion again
    const secondDelete = await stage({ ops, config, path: "SOUL.md", delete: true });

    expect(secondDelete.ok).toBe(true);
    if (!secondDelete.ok) return;

    // Should return empty (already staged for deletion)
    expect(secondDelete.value.stagedFiles).toEqual([]);
  });

  test("stage directory for editing when DELETE_SENTINEL exists → overwrites and stages files", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);

    // First stage directory for deletion
    const deleteResult = await stage({ ops, config, path: "memory", delete: true });
    expect(deleteResult.ok).toBe(true);

    // Verify sentinel was created
    const sentinelCheck = await ops.readFile(".soulguard-staging/memory");
    expect(sentinelCheck.ok && isDeleteSentinel(sentinelCheck.value)).toBe(true);

    // Then stage directory for editing (should overwrite sentinel and stage files)
    const editResult = await stage({ ops, config, path: "memory" });

    expect(editResult.ok).toBe(true);
    if (!editResult.ok) return;

    // Should stage the file inside the directory
    expect(editResult.value.stagedFiles).toEqual([{ path: "memory/notes.md", action: "edit" }]);

    // Verify file was staged (not the directory sentinel)
    const staged = await ops.readFile(".soulguard-staging/memory/notes.md");
    expect(staged.ok).toBe(true);
    if (staged.ok) {
      expect(staged.value).toBe("notes");
    }
  });

  test("stage directory for deletion when already staged for deletion → skips", async () => {
    const ops = makeMock();
    ops.addFile("memory/notes.md", "notes");
    ops.addDirectory("memory");

    const config = makeConfig(["memory"]);

    // First stage for deletion
    const firstDelete = await stage({ ops, config, path: "memory", delete: true });
    expect(firstDelete.ok).toBe(true);

    // Try to stage for deletion again
    const secondDelete = await stage({ ops, config, path: "memory", delete: true });

    expect(secondDelete.ok).toBe(true);
    if (!secondDelete.ok) return;

    // Should return empty (already staged for deletion)
    expect(secondDelete.value.stagedFiles).toEqual([]);
  });
});
