import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { reject } from "./reject.js";
import { diff } from "./diff.js";
import type { SoulguardConfig } from "./types.js";

const config: SoulguardConfig = { vault: ["SOUL.md"], ledger: [] };

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

describe("reject (implicit proposals)", () => {
  test("resets staging to match vault", async () => {
    const ops = setup();

    const result = await reject({ ops, config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resetFiles).toEqual(["SOUL.md"]);

    // Staging should now match vault
    const diffResult = await diff({ ops, config });
    expect(diffResult.ok).toBe(true);
    if (diffResult.ok) expect(diffResult.value.hasChanges).toBe(false);
  });

  test("returns no_changes when staging matches vault", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "same", { owner: "soulguardian", group: "soulguard", mode: "444" });
    ops.addFile(".soulguard/staging", "", { owner: "root", group: "root", mode: "755" });
    ops.addFile(".soulguard/staging/SOUL.md", "same", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await reject({ ops, config });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_changes");
  });

  test("rejects wrong password", async () => {
    const ops = setup();

    const result = await reject({
      ops,
      config,
      password: "wrong",
      verifyPassword: async (p) => p === "correct",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("wrong_password");
  });

  test("applies staging ownership after reset", async () => {
    const ops = setup();
    const stagingOwnership = { user: "agent", group: "soulguard", mode: "644" };

    const result = await reject({ ops, config, stagingOwnership });
    expect(result.ok).toBe(true);

    // Check staging content matches vault
    const stagingContent = await ops.readFile(".soulguard/staging/SOUL.md");
    expect(stagingContent.ok).toBe(true);
    if (stagingContent.ok) expect(stagingContent.value).toBe("original soul");
  });
});
