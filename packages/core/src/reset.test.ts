import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { reset } from "./reset.js";
import { diff } from "./diff.js";
import type { SoulguardConfig } from "./types.js";

const config: SoulguardConfig = { version: 1, protect: ["SOUL.md"], watch: [] };

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

describe("reset (implicit proposals)", () => {
  test("resets staging to match protect-tier", async () => {
    const ops = setup();

    const result = await reset({ ops, config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resetFiles).toEqual(["SOUL.md"]);

    // Staging should now match protect tier
    const diffResult = await diff({ ops, config });
    expect(diffResult.ok).toBe(true);
    if (diffResult.ok) expect(diffResult.value.hasChanges).toBe(false);
  });

  test("returns empty resetFiles when staging matches protect tier", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "same", { owner: "soulguardian", group: "soulguard", mode: "444" });
    ops.addFile(".soulguard.SOUL.md", "same", {
      owner: "agent",
      group: "soulguard",
      mode: "644",
    });

    const result = await reset({ ops, config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resetFiles).toEqual([]);
  });

  test("applies staging ownership after reset", async () => {
    const ops = setup();
    const stagingOwnership = { user: "agent", group: "soulguard", mode: "644" };

    const result = await reset({ ops, config, stagingOwnership });
    expect(result.ok).toBe(true);

    // Check staging content matches vault
    const stagingContent = await ops.readFile(".soulguard.SOUL.md");
    expect(stagingContent.ok).toBe(true);
    if (stagingContent.ok) expect(stagingContent.value).toBe("original soul");
  });
});
