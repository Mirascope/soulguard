import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { diff } from "./diff.js";
import { approve } from "./approve.js";
import type { SoulguardConfig, FileOwnership } from "./types.js";
import { err } from "./result.js";

const config: SoulguardConfig = { vault: ["SOUL.md"], ledger: [] };
const multiConfig: SoulguardConfig = { vault: ["SOUL.md", "AGENTS.md"], ledger: [] };
const vaultOwnership: FileOwnership = { user: "soulguardian", group: "soulguard", mode: "444" };

function setup() {
  const ops = new MockSystemOps("/workspace");
  ops.addFile("SOUL.md", "original soul", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
  ops.addFile(".soulguard/staging/SOUL.md", "modified soul", {
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

describe("approve (implicit proposals)", () => {
  test("applies changes when hash matches", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await approve({ ops, config, hash, vaultOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["SOUL.md"]);

    // Vault file should have new content
    const content = await ops.readFile("SOUL.md");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("modified soul");
  });

  test("rejects when no changes exist", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "same", { owner: "soulguardian", group: "soulguard", mode: "444" });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/SOUL.md", "same", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await approve({ ops, config, hash: "anyhash", vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_changes");
  });

  test("rejects hash mismatch (staging changed since review)", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    // Agent sneaks in a change after hash was computed
    ops.addFile(".soulguard/staging/SOUL.md", "sneaky different content", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await approve({ ops, config, hash, vaultOwnership });
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
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/SOUL.md", "modified soul", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(".soulguard/staging/AGENTS.md", "modified agents", {
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

    const result = await approve({ ops, config: multiConfig, hash, vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("apply_failed");

    // SOUL.md should be rolled back to original
    const soulContent = await ops.readFile("SOUL.md");
    expect(soulContent.ok).toBe(true);
    if (soulContent.ok) expect(soulContent.value).toBe("original soul");
  });

  test("syncs staging after successful approve", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);
    const stagingOwnership = { user: "agent", group: "soulguard", mode: "644" };

    const result = await approve({ ops, config, hash, vaultOwnership, stagingOwnership });
    expect(result.ok).toBe(true);

    // Staging should now match vault (no diff)
    const diffResult = await diff({ ops, config });
    expect(diffResult.ok).toBe(true);
    if (diffResult.ok) expect(diffResult.value.hasChanges).toBe(false);
  });

  test("cleans up pending directory after approve", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await approve({ ops, config, hash, vaultOwnership });
    expect(result.ok).toBe(true);

    // Pending files should be cleaned up
    const pendingExists = await ops.exists(".soulguard/pending/SOUL.md");
    expect(pendingExists.ok).toBe(true);
    if (pendingExists.ok) expect(pendingExists.value).toBe(false);
  });
});
