import { describe, test, expect } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { isGitEnabled, gitCommit, vaultCommitMessage, ledgerCommitMessage } from "./git.js";

describe("isGitEnabled", () => {
  test("returns true when git not false and .git exists", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".git", "");
    expect(await isGitEnabled(ops, { vault: [], ledger: [] })).toBe(true);
  });

  test("returns true when git explicitly true", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".git", "");
    expect(await isGitEnabled(ops, { vault: [], ledger: [], git: true })).toBe(true);
  });

  test("returns false when git is false", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".git", "");
    expect(await isGitEnabled(ops, { vault: [], ledger: [], git: false })).toBe(false);
  });

  test("returns false when no .git directory", async () => {
    const ops = new MockSystemOps("/workspace");
    expect(await isGitEnabled(ops, { vault: [], ledger: [] })).toBe(false);
  });
});

describe("gitCommit", () => {
  test("stages files and commits when changes exist", async () => {
    const ops = new MockSystemOps("/workspace");
    // diff --cached --quiet exits non-zero when there ARE staged changes
    ops.failingExecs.add("git diff --cached --quiet");
    const result = await gitCommit(ops, ["SOUL.md", "AGENTS.md"], "test commit");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.committed).toBe(true);
      expect(result.value.files).toEqual(["SOUL.md", "AGENTS.md"]);
      expect(result.value.message).toBe("test commit");
    }
    const execOps = ops.ops.filter((op) => op.kind === "exec");
    expect(execOps).toEqual([
      { kind: "exec", command: "git", args: ["add", "--", "SOUL.md"] },
      { kind: "exec", command: "git", args: ["add", "--", "AGENTS.md"] },
      { kind: "exec", command: "git", args: ["diff", "--cached", "--quiet"] },
      {
        kind: "exec",
        command: "git",
        args: [
          "commit",
          "--author",
          "SoulGuardian <soulguardian@soulguard.ai>",
          "-m",
          "test commit",
        ],
      },
    ]);
  });

  test("returns committed=false when nothing staged", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await gitCommit(ops, ["SOUL.md"], "test commit");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.committed).toBe(false);
    }
  });

  test("returns committed=false with empty files", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await gitCommit(ops, [], "empty");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.committed).toBe(false);
      expect(result.value.files).toEqual([]);
    }
  });
});

describe("commit messages", () => {
  test("vaultCommitMessage with files only", () => {
    expect(vaultCommitMessage(["SOUL.md"])).toBe("soulguard: vault update — SOUL.md");
  });

  test("vaultCommitMessage with approval message", () => {
    expect(vaultCommitMessage(["SOUL.md", "AGENTS.md"], "identity refresh")).toBe(
      "soulguard: vault update — SOUL.md, AGENTS.md\n\nidentity refresh",
    );
  });

  test("ledgerCommitMessage", () => {
    expect(ledgerCommitMessage()).toBe("soulguard: ledger sync");
  });
});
