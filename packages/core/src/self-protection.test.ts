import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { diff } from "./diff.js";
import { approve } from "./approve.js";
import type { SoulguardConfig, FileOwnership } from "./types.js";

const vaultOwnership: FileOwnership = { user: "soulguardian", group: "soulguard", mode: "444" };

async function getApprovalHash(ops: MockSystemOps, config: SoulguardConfig): Promise<string> {
  const result = await diff({ ops, config });
  if (!result.ok) throw new Error("diff failed");
  return result.value.approvalHash!;
}

describe("self-protection", () => {
  test("blocks invalid JSON in soulguard.json", async () => {
    const config: SoulguardConfig = { vault: ["soulguard.json"], ledger: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"vault":["soulguard.json"],"ledger":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/soulguard.json", "not valid json {{{", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
    if (result.error.kind === "self_protection") {
      expect(result.error.message).toContain("not be valid JSON");
    }
  });

  test("blocks invalid schema in soulguard.json", async () => {
    const config: SoulguardConfig = { vault: ["soulguard.json"], ledger: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"vault":["soulguard.json"],"ledger":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    // Missing ledger field
    ops.addFile(".soulguard/staging/soulguard.json", '{"vault":["soulguard.json"]}', {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, vaultOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
    if (result.error.kind === "self_protection") {
      expect(result.error.message).toContain("invalid after this change");
    }
  });

  test("allows valid soulguard.json changes", async () => {
    const config: SoulguardConfig = { vault: ["soulguard.json"], ledger: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"vault":["soulguard.json"],"ledger":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(
      ".soulguard/staging/soulguard.json",
      '{"vault":["soulguard.json","SOUL.md"],"ledger":["memory/**"]}',
      { owner: "agent", group: "soulguard", mode: "644" },
    );

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, vaultOwnership });
    expect(result.ok).toBe(true);
  });

  test("does not run when soulguard.json is not being changed", async () => {
    const config: SoulguardConfig = { vault: ["SOUL.md", "soulguard.json"], ledger: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("soulguard.json", '{"vault":["SOUL.md","soulguard.json"],"ledger":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/SOUL.md", "modified", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(
      ".soulguard/staging/soulguard.json",
      '{"vault":["SOUL.md","soulguard.json"],"ledger":[]}',
      { owner: "agent", group: "soulguard", mode: "644" },
    );

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, vaultOwnership });
    expect(result.ok).toBe(true);
  });

  test("self-protection cannot be bypassed with empty policies", async () => {
    const config: SoulguardConfig = { vault: ["soulguard.json"], ledger: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"vault":["soulguard.json"],"ledger":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/soulguard.json", "not json", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const hash = await getApprovalHash(ops, config);
    // Explicitly pass empty policies — self-protection still runs
    const result = await approve({ ops, config, hash, vaultOwnership, policies: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
  });
});
