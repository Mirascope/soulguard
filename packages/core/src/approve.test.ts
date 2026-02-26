import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { diff } from "./diff.js";
import { approve } from "./approve.js";
import type { SoulguardConfig, FileOwnership } from "./types.js";
import { ok, err } from "./result.js";

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

  test("rejects wrong password", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await approve({
      ops,
      config,
      hash,
      vaultOwnership,
      password: "wrong",
      verifyPassword: async (p) => p === "correct",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("wrong_password");
  });

  test("accepts correct password", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await approve({
      ops,
      config,
      hash,
      vaultOwnership,
      password: "correct",
      verifyPassword: async (p) => p === "correct",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects hash mismatch (staging changed since review)", async () => {
    const ops = setup();
    // Compute hash from current state
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

  test("runs beforeApprove policy hook", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await approve({
      ops,
      config,
      hash,
      vaultOwnership,
      beforeApprove: (ctx) => {
        const soul = ctx.get("SOUL.md");
        if (!soul) return err({ kind: "policy_violation" as const, message: "SOUL.md missing" });
        if (soul.final.includes("evil")) {
          return err({ kind: "policy_violation" as const, message: "evil content detected" });
        }
        return ok(undefined);
      },
    });
    expect(result.ok).toBe(true);
  });

  test("blocks on policy violation", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    const result = await approve({
      ops,
      config,
      hash,
      vaultOwnership,
      beforeApprove: (_ctx) => {
        return err({ kind: "policy_violation" as const, message: "blocked by policy" });
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("policy_violation");
    if (result.error.kind === "policy_violation") {
      expect(result.error.message).toBe("blocked by policy");
    }
  });

  test("beforeApprove receives correct context", async () => {
    const ops = setup();
    const hash = await getApprovalHash(ops, config);

    let capturedCtx: Map<string, { final: string; diff: string; previous: string }> | undefined;

    await approve({
      ops,
      config,
      hash,
      vaultOwnership,
      beforeApprove: (ctx) => {
        capturedCtx = ctx;
        return ok(undefined);
      },
    });

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.size).toBe(1);
    const soul = capturedCtx!.get("SOUL.md")!;
    expect(soul.final).toBe("modified soul");
    expect(soul.previous).toBe("original soul");
    expect(soul.diff).toContain("original soul");
    expect(soul.diff).toContain("modified soul");
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
});
