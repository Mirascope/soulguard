import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { propose } from "./propose.js";
import { approve } from "./approve.js";
import type { SoulguardConfig, FileOwnership } from "./types.js";

const config: SoulguardConfig = { vault: ["SOUL.md"], ledger: [] };
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
});
