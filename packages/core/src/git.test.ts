import { describe, test, expect } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import {
  isGitEnabled,
  gitCommit,
  vaultCommitMessage,
  ledgerCommitMessage,
  commitLedgerFiles,
} from "./git.js";

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
    // First diff --cached --quiet (pre-check) succeeds (no pre-existing staged changes)
    // Second diff --cached --quiet (post-add) fails (= our files are staged)
    ops.execFailOnCall.set("git diff --cached --quiet", new Set([1]));
    const result = await gitCommit(ops, ["SOUL.md", "AGENTS.md"], "test commit");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.committed).toBe(true);
    if (result.value.committed) {
      expect(result.value.files).toEqual(["SOUL.md", "AGENTS.md"]);
      expect(result.value.message).toBe("test commit");
    }
    const execOps = ops.ops.filter((op) => op.kind === "exec");
    expect(execOps).toEqual([
      { kind: "exec", command: "git", args: ["diff", "--cached", "--quiet"] },
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

  test("returns nothing_staged when nothing to commit", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await gitCommit(ops, ["SOUL.md"], "test commit");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.committed).toBe(false);
    if (!result.value.committed) {
      expect(result.value.reason).toBe("nothing_staged");
    }
  });

  test("returns dirty_staging when user has pre-existing staged changes", async () => {
    const ops = new MockSystemOps("/workspace");
    // Make the pre-check diff --cached --quiet fail (= there are staged changes)
    ops.failingExecs.add("git diff --cached --quiet");
    const result = await gitCommit(ops, ["SOUL.md"], "test commit");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.committed).toBe(false);
    if (!result.value.committed) {
      expect(result.value.reason).toBe("dirty_staging");
    }
    // Should NOT have called git add or git commit
    const gitOps = ops.ops.filter((o) => o.kind === "exec" && o.command === "git");
    expect(gitOps).toHaveLength(1); // only the diff check
  });

  test("returns no_files with empty files array", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await gitCommit(ops, [], "empty");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.committed).toBe(false);
    if (!result.value.committed) {
      expect(result.value.reason).toBe("no_files");
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

describe("commitLedgerFiles", () => {
  test("commits ledger files when git enabled and changes exist", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".git", "");
    // Pre-check succeeds (no pre-existing staged), post-add fails (= our files staged)
    ops.execFailOnCall.set("git diff --cached --quiet", new Set([1]));

    const result = await commitLedgerFiles(ops, {
      vault: [],
      ledger: ["MEMORY.md", "memory/*.md"],
      git: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.committed).toBe(true);
    if (result.value.committed) {
      expect(result.value.message).toBe("soulguard: ledger sync");
      // Globs are filtered out — only MEMORY.md staged
      expect(result.value.files).toEqual(["MEMORY.md"]);
    }
  });

  test("returns git_disabled when git not enabled", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await commitLedgerFiles(ops, { vault: [], ledger: ["MEMORY.md"], git: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ committed: false, reason: "git_disabled" });
  });

  test("returns no_files when no ledger files", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".git", "");
    const result = await commitLedgerFiles(ops, { vault: [], ledger: [], git: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ committed: false, reason: "no_files" });
  });

  test("returns no_files when only glob patterns", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".git", "");
    const result = await commitLedgerFiles(ops, {
      vault: [],
      ledger: ["memory/*.md"],
      git: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ committed: false, reason: "no_files" });
  });
});
