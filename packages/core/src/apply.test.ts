import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { diff } from "./diff.js";
import { apply } from "./apply.js";
import type { SoulguardConfig, FileOwnership } from "./types.js";
import type { Policy } from "./policy.js";
import { ok, err } from "./result.js";

const config: SoulguardConfig = { version: 1, protect: ["SOUL.md"], watch: [] };
const multiConfig: SoulguardConfig = { version: 1, protect: ["SOUL.md", "AGENTS.md"], watch: [] };
const protectOwnership: FileOwnership = { user: "soulguardian", group: "soulguard", mode: "444" };

function setup() {
  const ops = new MockSystemOps("/workspace");
  ops.addFile("SOUL.md", "original soul", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
  ops.addFile(".soulguard.SOUL.md", "modified soul", {
    owner: "agent",
    group: "soulguard",
    mode: "644",
  });
  return ops;
}

/** Helper to compute hash from current staging diff */
async function getApprovalHash(ops: MockSystemOps, cfg: SoulguardConfig): Promise<string> {
  const result = await diff({ ops, config: cfg });
  if (!result.ok) throw new Error("diff failed");
  return result.value.approvalHash!;
}

describe("apply (implicit proposals)", () => {
  test("applies changes when hash matches", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await apply({ ops, config, hash, protectOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["SOUL.md"]);

    // Protect-tier file should have new content
    const content = await ops.readFile("SOUL.md");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("modified soul");
  });

  test("rejects when no changes exist", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "same", { owner: "soulguardian", group: "soulguard", mode: "444" });
    ops.addFile(".soulguard.SOUL.md", "same", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await apply({ ops, config, hash: "anyhash", protectOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_changes");
  });

  test("rejects hash mismatch (staging changed since review)", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    // Agent sneaks in a change after hash was computed
    ops.addFile(".soulguard.SOUL.md", "sneaky different content", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await apply({ ops, config, hash, protectOwnership });
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
    ops.addFile(".soulguard.SOUL.md", "modified soul", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(".soulguard.AGENTS.md", "modified agents", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const hash = await getApprovalHash(ops, multiConfig);

    // Inject failure: make chown fail on AGENTS.md
    const originalChown = ops.chown.bind(ops);
    ops.chown = async (path, owner) => {
      if (path === "AGENTS.md") {
        return err({ kind: "permission_denied" as const, path, operation: "chown" });
      }
      return originalChown(path, owner);
    };

    const result = await apply({ ops, config: multiConfig, hash, protectOwnership });
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
    const hash = await getApprovalHash(ops, config);
    const stagingOwnership = { user: "agent", group: "soulguard", mode: "644" };

    const result = await apply({ ops, config, hash, protectOwnership, stagingOwnership });
    expect(result.ok).toBe(true);

    // Staging should now match protect tier (no diff)
    const diffResult = await diff({ ops, config });
    expect(diffResult.ok).toBe(true);
    if (diffResult.ok) expect(diffResult.value.hasChanges).toBe(false);
  });

  test("blocks on policy violation", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);
    const policies: Policy[] = [{ name: "block-all", check: () => err("blocked by policy") }];

    const result = await apply({ ops, config, hash, protectOwnership, policies });
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
    const hash = await getApprovalHash(ops, config);
    const policies: Policy[] = [{ name: "allow-all", check: () => ok(undefined) }];

    const result = await apply({ ops, config, hash, protectOwnership, policies });
    expect(result.ok).toBe(true);
  });

  test("rejects duplicate policy names", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);
    const policies: Policy[] = [
      { name: "dupe", check: () => ok(undefined) },
      { name: "dupe", check: () => ok(undefined) },
    ];

    const result = await apply({ ops, config, hash, protectOwnership, policies });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("policy_name_collision");
    if (result.error.kind === "policy_name_collision") {
      expect(result.error.duplicates).toEqual(["dupe"]);
    }
  });

  test("policy receives frozen pending content", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);
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

    await apply({ ops, config, hash, protectOwnership, policies });
    expect(capturedFinal).toBe("modified soul");
  });

  test("cleans up pending directory after apply", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await apply({ ops, config, hash, protectOwnership });
    expect(result.ok).toBe(true);

    // Pending files should be cleaned up
    const pendingExists = await ops.exists(".soulguard/pending/SOUL.md");
    expect(pendingExists.ok).toBe(true);
    if (pendingExists.ok) expect(pendingExists.value).toBe(false);
  });

  test("auto-commits protect-tier changes when git enabled", async () => {
    const ops = setup();
    ops.addFile(".soulguard/.git", ""); // git repo exists
    ops.execFailOnCall.set(
      "git --git-dir .soulguard/.git --work-tree . diff --cached --quiet",
      new Set([1]),
    );

    const gitConfig: SoulguardConfig = { ...config, git: true };
    const hash = await getApprovalHash(ops, gitConfig);
    const result = await apply({ ops, config: gitConfig, hash, protectOwnership });
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
    const hash = await getApprovalHash(ops, gitConfig);
    const result = await apply({ ops, config: gitConfig, hash, protectOwnership });
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
    // No staging/SOUL.md — agent deleted it

    const hash = await getApprovalHash(ops, config);
    const result = await apply({ ops, config, hash, protectOwnership });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["SOUL.md"]);

    // Protect-tier file should be gone
    const exists = await ops.exists("SOUL.md");
    expect(exists.ok).toBe(true);
    if (exists.ok) expect(exists.value).toBe(false);
  });

  test("blocks deletion of soulguard.json via self-protection", async () => {
    const sgConfig: SoulguardConfig = { version: 1, protect: ["soulguard.json"], watch: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"protect":["soulguard.json"],"watch":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // No staging/soulguard.json — agent trying to delete config

    const hash = await getApprovalHash(ops, sgConfig);
    const result = await apply({ ops, config: sgConfig, hash, protectOwnership });

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
    // SOUL.md deleted from staging, AGENTS.md modified
    ops.addFile(".soulguard.AGENTS.md", "modified agents", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const hash = await getApprovalHash(ops, multiConfig);
    const result = await apply({ ops, config: multiConfig, hash, protectOwnership });

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
      protect: ["SOUL.md", "AGENTS.md"],
      watch: [],
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
    // Both files deleted from staging

    const hash = await getApprovalHash(ops, twoDeleteConfig);

    // Make AGENTS.md deletion fail (SOUL.md deletes first alphabetically)
    ops.failingDeletes.add("AGENTS.md");

    const result = await apply({ ops, config: twoDeleteConfig, hash, protectOwnership });

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
    // No staging/SOUL.md — agent deleted it
    ops.execFailOnCall.set(
      "git --git-dir .soulguard/.git --work-tree . diff --cached --quiet",
      new Set([1]),
    );

    const gitConfig: SoulguardConfig = { ...config, git: true };
    const hash = await getApprovalHash(ops, gitConfig);
    const result = await apply({ ops, config: gitConfig, hash, protectOwnership });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gitResult).toBeDefined();
    expect(result.value.gitResult!.committed).toBe(true);
    // git add should have been called with SOUL.md (stages the deletion)
    const execOps = ops.ops.filter((op) => op.kind === "exec");
    expect(execOps.some((op) => op.kind === "exec" && op.args.includes("SOUL.md"))).toBe(true);
  });
});
