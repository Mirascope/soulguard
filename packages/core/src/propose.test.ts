import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { propose } from "./propose.js";
import type { SoulguardConfig } from "./types.js";

const config: SoulguardConfig = { vault: ["SOUL.md", "soulguard.json"], ledger: [] };

function setup() {
  const ops = new MockSystemOps("/workspace");
  // Vault files (protected)
  ops.addFile("SOUL.md", "original soul", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  ops.addFile("soulguard.json", '{"vault":["SOUL.md","soulguard.json"],"ledger":[]}', {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  // Staging directory
  ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
  return ops;
}

describe("propose", () => {
  test("creates proposal when staging differs from vault", async () => {
    const ops = setup();
    // Staging copy with changes
    ops.addFile(".soulguard/staging/SOUL.md", "modified soul", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(
      ".soulguard/staging/soulguard.json",
      '{"vault":["SOUL.md","soulguard.json"],"ledger":[]}',
      {
        owner: "agent",
        group: "soulguard",
        mode: "644",
      },
    );

    const result = await propose({ ops, config, message: "update soul" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.changedCount).toBe(1); // only SOUL.md changed
    expect(result.value.proposal.files[0]!.path).toBe("SOUL.md");
    expect(result.value.proposal.message).toBe("update soul");
  });

  test("returns no_changes when staging matches vault", async () => {
    const ops = setup();
    // Staging copies identical to vault
    ops.addFile(".soulguard/staging/SOUL.md", "original soul", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(
      ".soulguard/staging/soulguard.json",
      '{"vault":["SOUL.md","soulguard.json"],"ledger":[]}',
      {
        owner: "agent",
        group: "soulguard",
        mode: "644",
      },
    );

    const result = await propose({ ops, config });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_changes");
  });

  test("rejects when no staging directory", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original", { owner: "soulguardian", group: "soulguard", mode: "444" });

    const result = await propose({ ops, config });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_staging");
  });

  test("rejects when proposal already exists", async () => {
    const ops = setup();
    ops.addFile(".soulguard/staging/SOUL.md", "modified", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });
    ops.addFile(".soulguard/proposal.json", '{"version":"1"}', {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await propose({ ops, config });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("write_failed");
  });
});
