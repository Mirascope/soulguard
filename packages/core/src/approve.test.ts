import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { propose } from "./propose.js";
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

describe("approve", () => {
  test("applies proposal and re-protects vault files", async () => {
    const ops = setup();

    // Create proposal first
    const propResult = await propose({ ops, config });
    expect(propResult.ok).toBe(true);

    // Approve it
    const result = await approve({ ops, vaultOwnership });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFiles).toEqual(["SOUL.md"]);

    // Vault file should have new content
    const content = await ops.readFile("SOUL.md");
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.value).toBe("modified soul");

    // Proposal should be deleted
    const proposalExists = await ops.exists(".soulguard/proposal.json");
    expect(proposalExists.ok).toBe(true);
    if (proposalExists.ok) expect(proposalExists.value).toBe(false);
  });

  test("rejects when no proposal exists", async () => {
    const ops = setup();
    const result = await approve({ ops, vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_proposal");
  });

  test("rejects wrong password", async () => {
    const ops = setup();
    await propose({ ops, config });

    const result = await approve({
      ops,
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
    await propose({ ops, config });

    const result = await approve({
      ops,
      vaultOwnership,
      password: "correct",
      verifyPassword: async (p) => p === "correct",
    });
    expect(result.ok).toBe(true);
  });

  test("detects stale proposal when vault changed", async () => {
    const ops = setup();
    await propose({ ops, config });

    // Simulate vault file changing after propose (e.g., another owner edit)
    ops.addFile("SOUL.md", "someone else edited", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });

    const result = await approve({ ops, vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("stale_proposal");
  });

  test("rolls back on partial apply failure", async () => {
    const ops = new MockSystemOps("/workspace");
    // Two vault files
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

    // Create proposal with both files
    const propResult = await propose({ ops, config: multiConfig });
    expect(propResult.ok).toBe(true);
    if (!propResult.ok) return;
    expect(propResult.value.changedCount).toBe(2);

    // Inject failure: make chown fail on AGENTS.md (second file)
    const originalChown = ops.chown.bind(ops);
    ops.chown = async (path, owner) => {
      // Fail on the 2nd chown during apply (AGENTS.md protection)
      // Skip backup chowns (they don't happen) and SOUL.md chown
      if (path === "AGENTS.md") {
        return err({ kind: "permission_denied" as const, path, operation: "chown" });
      }
      return originalChown(path, owner);
    };

    const result = await approve({ ops, vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("apply_failed");

    // SOUL.md should be rolled back to original
    const soulContent = await ops.readFile("SOUL.md");
    expect(soulContent.ok).toBe(true);
    if (soulContent.ok) expect(soulContent.value).toBe("original soul");
  });
});
