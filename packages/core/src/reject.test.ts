import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { propose } from "./propose.js";
import { reject } from "./reject.js";
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

describe("reject", () => {
  test("resets staging and deletes proposal", async () => {
    const ops = setup();

    // Create proposal
    const propResult = await propose({ ops, config });
    expect(propResult.ok).toBe(true);

    // Reject it
    const result = await reject({ ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.resetFiles).toEqual(["SOUL.md"]);

    // Staging should match vault again
    const stagingContent = await ops.readFile(".soulguard/staging/SOUL.md");
    expect(stagingContent.ok).toBe(true);
    if (stagingContent.ok) expect(stagingContent.value).toBe("original soul");

    // Proposal should be deleted
    const proposalExists = await ops.exists(".soulguard/proposal.json");
    expect(proposalExists.ok).toBe(true);
    if (proposalExists.ok) expect(proposalExists.value).toBe(false);
  });

  test("rejects when no proposal exists", async () => {
    const ops = setup();
    const result = await reject({ ops });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_proposal");
  });

  test("rejects wrong password", async () => {
    const ops = setup();
    await propose({ ops, config });

    const result = await reject({
      ops,
      password: "wrong",
      verifyPassword: async (p) => p === "correct",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("wrong_password");
  });
});
