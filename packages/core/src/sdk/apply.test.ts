import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { diff } from "./diff.js";
import { apply } from "./apply.js";
import { StateTree } from "./state.js";
import type { SoulguardConfig, FileOwnership } from "../util/types.js";
import type { Policy } from "./policy.js";
import { ok, err } from "../util/result.js";
import { DELETE_SENTINEL } from "./staging.js";

const config: SoulguardConfig = {
  version: 1,
  files: {
    "SOUL.md": "protect",
  },
};
const multiConfig: SoulguardConfig = {
  version: 1,
  files: {
    "SOUL.md": "protect",
    "AGENTS.md": "protect",
  },
};
const protectOwnership: FileOwnership = { user: "soulguardian", group: "soulguard", mode: "444" };

function setup() {
  const ops = new MockSystemOps("/workspace");
  ops.addFile("SOUL.md", "original soul", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
  ops.addFile(".soulguard-staging/SOUL.md", "modified soul", {
    owner: "agent",
    group: "soulguard",
    mode: "644",
  });
  return ops;
}

/** Build a StateTree and return it (throws on failure). */
async function buildTree(ops: MockSystemOps, cfg: SoulguardConfig): Promise<StateTree> {
  const result = await StateTree.build({ ops, config: cfg });
  if (!result.ok) throw new Error("tree build failed");
  return result.value;
}

describe("apply (implicit proposals)", () => {
  test("applies changes when hash matches", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["SOUL.md"]);

    // Protect-tier file should have new content
    const content = await ops.readFile("SOUL.md");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("modified soul");
  });

  test("succeeds with empty appliedFiles when no changes exist", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "same", { owner: "soulguardian", group: "soulguard", mode: "444" });
    ops.addFile(".soulguard-staging/SOUL.md", "same", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const tree = await buildTree(ops, config);
    const result = await apply({ ops, tree, hash: "anyhash", protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual([]);
  });

  test("rejects hash mismatch (staging changed since review)", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);

    // Agent sneaks in a change after tree was built
    ops.addFile(".soulguard-staging/SOUL.md", "sneaky different content", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    // Per-file hash verification catches the tampering after write
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("hash_mismatch");
  });

  test("rolls back on partial apply failure", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("AGENTS.md", "original agents", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "modified soul", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(".soulguard-staging/AGENTS.md", "modified agents", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const tree = await buildTree(ops, multiConfig);

    // Inject failure: make chown fail on AGENTS.md
    const originalChown = ops.chown.bind(ops);
    ops.chown = async (path, owner) => {
      if (path === "AGENTS.md") {
        return err({ kind: "permission_denied" as const, path, operation: "chown" });
      }
      return originalChown(path, owner);
    };

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("apply_failed");

    // SOUL.md should be rolled back to original
    const soulContent = await ops.readFile("SOUL.md");
    expect(soulContent.ok).toBe(true);
    if (soulContent.ok) expect(soulContent.value).toBe("original soul");
  });

  test("syncs staging after successful apply", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);

    // Staging should now match protect tier (no diff)
    const diffResult = await diff({ ops, config });
    expect(diffResult.ok).toBe(true);
    if (diffResult.ok) expect(diffResult.value.hasChanges).toBe(false);
  });

  test("blocks on policy violation", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);
    const policies: Policy[] = [{ name: "block-all", check: () => err("blocked by policy") }];

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership, policies });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("policy_violation");
    if (result.error.kind === "policy_violation") {
      expect(result.error.violations).toHaveLength(1);
      expect(result.error.violations[0]!.policy).toBe("block-all");
    }

    // Protect-tier should be unchanged
    const content = await ops.readFile("SOUL.md");
    if (content.ok) expect(content.value).toBe("original soul");
  });

  test("passes with allowing policy", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);
    const policies: Policy[] = [{ name: "allow-all", check: () => ok(undefined) }];

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership, policies });
    expect(result.ok).toBe(true);
  });

  test("rejects duplicate policy names", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);
    const policies: Policy[] = [
      { name: "dupe", check: () => ok(undefined) },
      { name: "dupe", check: () => ok(undefined) },
    ];

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership, policies });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("policy_name_collision");
    if (result.error.kind === "policy_name_collision") {
      expect(result.error.duplicates).toEqual(["dupe"]);
    }
  });

  test("policy receives staging content", async () => {
    const ops = setup();
    const tree = await buildTree(ops, config);
    let capturedFinal: string | undefined;
    const policies: Policy[] = [
      {
        name: "capture",
        check: (ctx) => {
          capturedFinal = ctx.get("SOUL.md")?.final;
          return ok(undefined);
        },
      },
    ];

    await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership, policies });
    expect(capturedFinal).toBe("modified soul");
  });

  test("auto-commits protect-tier changes when git enabled", async () => {
    const ops = setup();
    ops.addFile(".soulguard/.git", ""); // git repo exists
    ops.execFailOnCall.set(
      "git --git-dir .soulguard/.git --work-tree . diff --cached --quiet",
      new Set([1]),
    );

    const gitConfig: SoulguardConfig = { ...config, git: true };
    const tree = await buildTree(ops, gitConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitResult).toBeDefined();
    expect(result.value.gitResult!.committed).toBe(true);
    if (result.value.gitResult!.committed) {
      expect(result.value.gitResult!.message).toContain("SOUL.md");
    }
  });

  test("skips git commit when git disabled", async () => {
    const ops = setup();
    ops.addFile(".soulguard/.git", "");

    const gitConfig: SoulguardConfig = { ...config, git: false };
    const tree = await buildTree(ops, gitConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitResult).toBeUndefined();
  });

  test("deletes protect-tier file when staging copy is removed", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // Staging has DELETE_SENTINEL — agent wants to delete it
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));

    const tree = await buildTree(ops, config);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["SOUL.md"]);

    // Protect-tier file should be gone
    const exists = await ops.exists("SOUL.md");
    expect(exists.ok).toBe(true);
    if (exists.ok) expect(exists.value).toBe(false);
  });

  test("blocks deletion of soulguard.json via self-protection", async () => {
    const sgConfig: SoulguardConfig = {
      version: 1,
      files: {
        "soulguard.json": "protect",
      },
    };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"protect":["soulguard.json"],"watch":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // Staging has DELETE_SENTINEL — agent trying to delete config
    ops.addFile(".soulguard-staging/soulguard.json", JSON.stringify(DELETE_SENTINEL));

    const tree = await buildTree(ops, sgConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
  });

  test("deletion + modification in same apply", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("AGENTS.md", "original agents", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // SOUL.md has DELETE_SENTINEL in staging, AGENTS.md modified
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));
    ops.addFile(".soulguard-staging/AGENTS.md", "modified agents", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const tree = await buildTree(ops, multiConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toContain("SOUL.md");
    expect(result.value.appliedFiles).toContain("AGENTS.md");

    // SOUL.md deleted, AGENTS.md updated
    const soulExists = await ops.exists("SOUL.md");
    expect(soulExists.ok && soulExists.value).toBe(false);
    const agentsContent = await ops.readFile("AGENTS.md");
    expect(agentsContent.ok && agentsContent.value).toBe("modified agents");
  });

  test("rollback restores deleted files when subsequent deletion fails", async () => {
    const twoDeleteConfig: SoulguardConfig = {
      version: 1,
      files: {
        "SOUL.md": "protect",
        "AGENTS.md": "protect",
      },
    };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("AGENTS.md", "original agents", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // Both files have DELETE_SENTINEL in staging
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));
    ops.addFile(".soulguard-staging/AGENTS.md", JSON.stringify(DELETE_SENTINEL));

    const tree = await buildTree(ops, twoDeleteConfig);

    // Make AGENTS.md deletion fail (SOUL.md deletes first alphabetically)
    ops.failingDeletes.add("AGENTS.md");

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("apply_failed");

    // SOUL.md should be restored from backup
    const soulContent = await ops.readFile("SOUL.md");
    expect(soulContent.ok).toBe(true);
    if (soulContent.ok) expect(soulContent.value).toBe("original soul");
  });

  test("deleted file with git commits deletion", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".soulguard/.git", "");
    ops.addFile("SOUL.md", "original soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // Staging has DELETE_SENTINEL — agent wants to delete it
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));
    ops.execFailOnCall.set(
      "git --git-dir .soulguard/.git --work-tree . diff --cached --quiet",
      new Set([1]),
    );

    const gitConfig: SoulguardConfig = { ...config, git: true };
    const tree = await buildTree(ops, gitConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gitResult).toBeDefined();
    expect(result.value.gitResult!.committed).toBe(true);
    // git add should have been called with SOUL.md (stages the deletion)
    const execOps = ops.ops.filter((op) => op.kind === "exec");
    expect(execOps.some((op) => op.kind === "exec" && op.args.includes("SOUL.md"))).toBe(true);
  });
});

describe("apply (directory support)", () => {
  const dirConfig: SoulguardConfig = {
    version: 1,
    files: {
      "mydir/": "protect",
    },
  };

  function setupDir() {
    const ops = new MockSystemOps("/workspace");
    // Protected directory with two files
    ops.addDirectory("mydir", { owner: "soulguardian", group: "soulguard", mode: "755" });
    ops.addFile("mydir/file1.txt", "original file1", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("mydir/file2.txt", "original file2", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // Staging directory with modified file1
    ops.addDirectory(".soulguard-staging/mydir", {
      owner: "agent",
      group: "soulguard",
      mode: "755",
    });
    ops.addFile(".soulguard-staging/mydir/file1.txt", "modified file1", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(".soulguard-staging/mydir/file2.txt", "original file2", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    return ops;
  }

  test("applies modified file inside protected directory", async () => {
    const ops = setupDir();
    const tree = await buildTree(ops, dirConfig);

    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["mydir/file1.txt"]);

    // File should have new content
    const content = await ops.readFile("mydir/file1.txt");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("modified file1");

    // Unchanged file should remain
    const content2 = await ops.readFile("mydir/file2.txt");
    expect(content2.ok).toBe(true);
    if (content2.ok) expect(content2.value).toBe("original file2");
  });

  test("applies new file added to protected directory", async () => {
    const ops = setupDir();
    // Add a new file in staging
    ops.addFile(".soulguard-staging/mydir/file3.txt", "new file3", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const tree = await buildTree(ops, dirConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toContain("mydir/file1.txt");
    expect(result.value.appliedFiles).toContain("mydir/file3.txt");

    // New file should exist with correct content
    const content = await ops.readFile("mydir/file3.txt");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("new file3");
  });

  test("applies deletion of file inside protected directory", async () => {
    const ops2 = new MockSystemOps("/workspace");
    ops2.addDirectory("mydir", { owner: "soulguardian", group: "soulguard", mode: "755" });
    ops2.addFile("mydir/file1.txt", "original file1", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops2.addFile("mydir/file2.txt", "original file2", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops2.addDirectory(".soulguard-staging/mydir", {
      owner: "agent",
      group: "soulguard",
      mode: "755",
    });
    ops2.addFile(".soulguard-staging/mydir/file1.txt", "original file1", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    // file2 has DELETE_SENTINEL in staging → deletion
    ops2.addFile(".soulguard-staging/mydir/file2.txt", JSON.stringify(DELETE_SENTINEL));

    const tree = await buildTree(ops2, dirConfig);
    const result = await apply({ ops: ops2, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toContain("mydir/file2.txt");

    // file2 should be deleted
    const exists = await ops2.exists("mydir/file2.txt");
    expect(exists.ok).toBe(true);
    if (exists.ok) expect(exists.value).toBe(false);

    // file1 should remain unchanged
    const content = await ops2.readFile("mydir/file1.txt");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("original file1");
  });

  test("directory + individual file in same config", async () => {
    const mixedConfig: SoulguardConfig = {
      version: 1,
      files: {
        "mydir/": "protect",
        "SOUL.md": "protect",
      },
    };

    const ops = setupDir();
    ops.addFile("SOUL.md", "original soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "modified soul", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const tree = await buildTree(ops, mixedConfig);
    const result = await apply({ ops, tree, hash: tree.approvalHash!, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toContain("SOUL.md");
    expect(result.value.appliedFiles).toContain("mydir/file1.txt");
  });
});
