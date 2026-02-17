import { describe, expect, test } from "bun:test";
import { status } from "./status.js";
import { MockSystemOps } from "./system-ops-mock.js";
import type { FileStatus } from "./status.js";
import { formatIssue } from "./types.js";
import type { DriftIssue } from "./types.js";

const WORKSPACE = "/test/workspace";
const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" };
const LEDGER_OWNERSHIP = { user: "aster", group: "staff", mode: "644" };

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(VAULT_OWNERSHIP.user);
  ops.addGroup(VAULT_OWNERSHIP.group);
  return ops;
}

function opts(config: { vault: string[]; ledger: string[] }, ops: MockSystemOps) {
  return {
    config,
    expectedVaultOwnership: VAULT_OWNERSHIP,
    expectedLedgerOwnership: LEDGER_OWNERSHIP,
    ops,
  };
}

describe("status", () => {
  test("reports ok when vault file is correct", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ vault: ["SOUL.md"], ledger: [] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.vault).toHaveLength(1);
    expect(result.value.vault[0]!.status).toBe("ok");
    expect(result.value.issues).toHaveLength(0);
  });

  test("reports drifted with semantic issues when vault file has wrong owner", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ vault: ["SOUL.md"], ledger: [] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.vault[0]! as FileStatus & { status: "drifted" };
    expect(file.status).toBe("drifted");
    expect(file.issues).toContainEqual({
      kind: "wrong_owner",
      expected: VAULT_OWNERSHIP.user,
      actual: "agent",
    });
    expect(result.value.issues).toHaveLength(1);
  });

  test("reports drifted when vault file has wrong mode", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await status(opts({ vault: ["SOUL.md"], ledger: [] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.vault[0]! as FileStatus & { status: "drifted" };
    expect(file.status).toBe("drifted");
    expect(file.issues).toContainEqual({
      kind: "wrong_mode",
      expected: "444",
      actual: "644",
    });
  });

  test("reports missing vault files", async () => {
    const ops = makeMock();

    const result = await status(opts({ vault: ["SOUL.md"], ledger: [] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.vault[0]!.status).toBe("missing");
    expect(result.value.issues).toHaveLength(1);
  });

  test("includes hashes in FileInfo for ok files", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ vault: ["SOUL.md"], ledger: [] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.vault[0]! as FileStatus & { status: "ok" };
    expect(file.file.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("reports glob_skipped for glob patterns", async () => {
    const ops = makeMock();

    const result = await status(opts({ vault: ["memory/**"], ledger: ["skills/**"] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.vault[0]!.status).toBe("glob_skipped");
    expect(result.value.ledger[0]!.status).toBe("glob_skipped");
    expect(result.value.issues).toHaveLength(0);
  });

  test("reports multiple semantic issues on same file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: "staff",
      mode: "777",
    });

    const result = await status(opts({ vault: ["SOUL.md"], ledger: [] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.vault[0]! as FileStatus & { status: "drifted" };
    expect(file.issues).toHaveLength(3);
    expect(file.issues.map((i) => i.kind)).toEqual(["wrong_owner", "wrong_group", "wrong_mode"]);
  });

  test("issues array contains all problems from both tiers", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ vault: ["SOUL.md"], ledger: ["notes.md"] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(2);
  });

  test("ledger ok files include FileInfo", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: LEDGER_OWNERSHIP.user,
      group: LEDGER_OWNERSHIP.group,
      mode: "644",
    });

    const result = await status(opts({ vault: [], ledger: ["notes.md"] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.ledger[0]! as FileStatus & { status: "ok" };
    expect(file.status).toBe("ok");
    expect(file.file.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(file.file.ownership.user).toBe(LEDGER_OWNERSHIP.user);
  });

  test("ledger file owned by guardian reports drift", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ vault: [], ledger: ["notes.md"] }, ops));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.ledger[0]! as FileStatus & { status: "drifted" };
    expect(file.status).toBe("drifted");
    expect(file.issues).toContainEqual({
      kind: "wrong_owner",
      expected: LEDGER_OWNERSHIP.user,
      actual: VAULT_OWNERSHIP.user,
    });
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
