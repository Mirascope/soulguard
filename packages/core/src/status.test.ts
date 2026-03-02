import { describe, expect, test } from "bun:test";
import { status } from "./status.js";
import { MockSystemOps } from "./system-ops-mock.js";
import type { FileStatus } from "./status.js";
import { Registry } from "./registry.js";
import { formatIssue } from "./types.js";
import type { DriftIssue } from "./types.js";

const WORKSPACE = "/test/workspace";
const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" };

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(VAULT_OWNERSHIP.user);
  ops.addGroup(VAULT_OWNERSHIP.group);
  return ops;
}

async function opts(
  config: { version: 1; files: Record<string, "protect" | "watch"> },
  ops: MockSystemOps,
) {
  const registryResult = await Registry.load(ops);
  if (!registryResult.ok) throw new Error("Failed to load registry");
  return {
    config,
    expectedProtectOwnership: VAULT_OWNERSHIP,
    ops,
    registry: registryResult.value,
  };
}

describe("status", () => {
  test("no issues when protect-tier file is correct", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(await opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only registry issues (unregistered), no file-level issues
    const fileIssues = result.value.issues.filter((i) => i.status !== "unregistered");
    expect(fileIssues).toHaveLength(0);
  });

  test("reports drifted when protect-tier file has wrong owner", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(await opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toContainEqual({
      kind: "wrong_owner",
      expected: VAULT_OWNERSHIP.user,
      actual: "agent",
    });
  });

  test("reports drifted when protect-tier file has wrong mode", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await status(await opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toContainEqual({
      kind: "wrong_mode",
      expected: "444",
      actual: "644",
    });
  });

  test("reports missing protect-tier files", async () => {
    const ops = makeMock();

    const result = await status(await opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const missing = result.value.issues.find((i) => i.status === "missing");
    expect(missing).toBeDefined();
  });

  test("resolves glob patterns to matching files", async () => {
    const ops = makeMock();
    ops.addFile("memory/day1.md", "notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: VAULT_OWNERSHIP.mode,
    });
    ops.addFile("skills/python.md", "skill", {
      owner: "selene",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      await opts({ version: 1, files: { "memory/**": "protect", "skills/**": "watch" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No file-level issues (both files are correct for their tier)
    const fileIssues = result.value.issues.filter(
      (i) => !["unregistered", "tier_changed", "orphaned"].includes(i.status),
    );
    expect(fileIssues).toHaveLength(0);
  });

  test("glob with no matches returns no issues", async () => {
    const ops = makeMock();

    const result = await status(
      await opts({ version: 1, files: { "memory/**": "protect", "skills/**": "watch" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(0);
  });

  test("reports multiple semantic issues on same file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "777" });

    const result = await status(await opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toHaveLength(3);
    expect(drifted.issues.map((i) => i.kind)).toEqual(["wrong_owner", "wrong_group", "wrong_mode"]);
  });

  test("issues array contains problems from both tiers", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      await opts({ version: 1, files: { "SOUL.md": "protect", "notes.md": "watch" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // SOUL.md drifted + notes.md missing = 2 file-level issues
    const fileIssues = result.value.issues.filter(
      (i) => !["unregistered", "tier_changed", "orphaned"].includes(i.status),
    );
    expect(fileIssues).toHaveLength(2);
  });

  test("watch-tier files with any ownership report no issues", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(await opts({ version: 1, files: { "notes.md": "watch" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fileIssues = result.value.issues.filter(
      (i) => !["unregistered", "tier_changed", "orphaned"].includes(i.status),
    );
    expect(fileIssues).toHaveLength(0);
  });

  test("formatIssue produces readable strings", () => {
    const issues: DriftIssue[] = [
      { kind: "wrong_owner", expected: "soulguardian", actual: "agent" },
      { kind: "wrong_mode", expected: "444", actual: "644" },
    ];
    expect(formatIssue(issues[0]!)).toBe("owner is agent, expected soulguardian");
    expect(formatIssue(issues[1]!)).toBe("mode is 644, expected 444");
  });
});
