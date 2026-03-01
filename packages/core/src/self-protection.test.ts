import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { diff } from "./diff.js";
import { approve } from "./approve.js";
import type { SoulguardConfig, FileOwnership } from "./types.js";

const protectOwnership: FileOwnership = { user: "soulguardian", group: "soulguard", mode: "444" };

async function getApprovalHash(ops: MockSystemOps, config: SoulguardConfig): Promise<string> {
  const result = await diff({ ops, config });
  if (!result.ok) throw new Error("diff failed");
  return result.value.approvalHash!;
}

describe("self-protection", () => {
  test("blocks invalid JSON in soulguard.json", async () => {
    const config: SoulguardConfig = { version: 1, protect: ["soulguard.json"], watch: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"version":1,"protect":["soulguard.json"],"watch":[]}', {
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
    const result = await approve({ ops, config, hash, protectOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
    if (result.error.kind === "self_protection") {
      expect(result.error.message).toContain("not be valid JSON");
    }
  });

  test("blocks invalid schema in soulguard.json", async () => {
    const config: SoulguardConfig = { version: 1, protect: ["soulguard.json"], watch: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"version":1,"protect":["soulguard.json"],"watch":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    // Missing watch field
    ops.addFile(".soulguard/staging/soulguard.json", '{"version":1,"protect":["soulguard.json"]}', {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, protectOwnership });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
    if (result.error.kind === "self_protection") {
      expect(result.error.message).toContain("invalid after this change");
    }
  });

  test("allows valid soulguard.json changes", async () => {
    const config: SoulguardConfig = { version: 1, protect: ["soulguard.json"], watch: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"version":1,"protect":["soulguard.json"],"watch":[]}', {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(
      ".soulguard/staging/soulguard.json",
      '{"version":1,"protect":["soulguard.json","SOUL.md"],"watch":["memory/**"]}',
      { owner: "agent", group: "soulguard", mode: "644" },
    );

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, protectOwnership });
    expect(result.ok).toBe(true);
  });

  test("does not run when soulguard.json is not being changed", async () => {
    const config: SoulguardConfig = {
      version: 1,
      protect: ["SOUL.md", "soulguard.json"],
      watch: [],
    };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(
      "soulguard.json",
      '{"version":1,"protect":["SOUL.md","soulguard.json"],"watch":[]}',
      {
        owner: "soulguardian",
        group: "soulguard",
        mode: "444",
      },
    );
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/SOUL.md", "modified", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(
      ".soulguard/staging/soulguard.json",
      '{"version":1,"protect":["SOUL.md","soulguard.json"],"watch":[]}',
      { owner: "agent", group: "soulguard", mode: "644" },
    );

    const hash = await getApprovalHash(ops, config);
    const result = await approve({ ops, config, hash, protectOwnership });
    expect(result.ok).toBe(true);
  });

  test("self-protection cannot be bypassed with empty policies", async () => {
    const config: SoulguardConfig = { version: 1, protect: ["soulguard.json"], watch: [] };
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"version":1,"protect":["soulguard.json"],"watch":[]}', {
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
    const result = await approve({ ops, config, hash, protectOwnership, policies: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("self_protection");
  });
});
