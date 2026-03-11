import { describe, expect, test } from "bun:test";
import { status } from "./status.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { formatIssue } from "../util/types.js";
import type { DriftIssue } from "../util/types.js";

const WORKSPACE = "/test/workspace";
const GUARDIAN = "soulguardian_agent";
const VAULT_OWNERSHIP = { user: GUARDIAN, group: "soulguard", mode: "444" };

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(VAULT_OWNERSHIP.user);
  ops.addGroup(VAULT_OWNERSHIP.group);
  return ops;
}

function opts(
  config: { version: 1; guardian: string; files: Record<string, "protect" | "watch"> },
  ops: MockSystemOps,
) {
  return { config, ops };
}

describe("status", () => {
  // ── Changed files ──────────────────────────────────────────────────

  test("correct protected file is not in changed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(0);
    expect(result.value.drifts).toHaveLength(0);
  });

  test("staged modification appears in changed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "# Updated Soul", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(1);
    expect(result.value.changed[0]!.path).toBe("SOUL.md");
    expect(result.value.changed[0]!.status).toBe("modified");
  });

  test("staged directory changes appear in changed", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addDirectory(".soulguard-staging/skills", {
      owner: "agent",
      group: "staff",
      mode: "755",
    });
    ops.addFile(".soulguard-staging/skills/python.md", "updated skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });
    ops.addFile(".soulguard-staging/skills/rust.md", "new skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "skills/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(2);
    const paths = result.value.changed.map((f) => f.path).sort();
    expect(paths).toEqual(["skills/python.md", "skills/rust.md"]);
  });

  test("no staged changes when staging dir is empty", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(0);
  });

  // ── Config entries with no file on disk ────────────────────────────

  test("config entry with no file on disk is not reported", async () => {
    const ops = makeMock();

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(0);
    expect(result.value.drifts).toHaveLength(0);
  });

  // ── Drift detection ────────────────────────────────────────────────

  test("reports drift when protected file has wrong owner", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts).toHaveLength(1);
    expect(result.value.drifts[0]!.details).toContainEqual({
      kind: "wrong_owner",
      expected: VAULT_OWNERSHIP.user,
      actual: "agent",
    });
  });

  test("reports drift when protected file has wrong mode", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts).toHaveLength(1);
    expect(result.value.drifts[0]!.details).toContainEqual({
      kind: "wrong_mode",
      expected: "444",
      actual: "644",
    });
  });

  test("reports multiple drift issues on same file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "777" });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts).toHaveLength(1);
    expect(result.value.drifts[0]!.details).toHaveLength(3);
    expect(result.value.drifts[0]!.details.map((d) => d.kind)).toEqual([
      "wrong_owner",
      "wrong_group",
      "wrong_mode",
    ]);
  });

  test("watched files produce no drifts regardless of ownership", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "notes.md": "watch" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts).toHaveLength(0);
  });

  // ── Directory drift ────────────────────────────────────────────────

  test("directory with correct ownership produces no drifts", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "skills/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts).toHaveLength(0);
  });

  test("directory with wrong child ownership reports per-file drifts", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "skills/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts.length).toBeGreaterThan(0);
    const childDrift = result.value.drifts.find((d) => d.entity.path === "skills/python.md");
    expect(childDrift).toBeDefined();
  });

  test("directory expects mode 555 not 444", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444", // wrong — should be 555
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "skills/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dirDrift = result.value.drifts.find((d) => d.entity.path === "skills");
    expect(dirDrift).toBeDefined();
    expect(dirDrift!.details).toContainEqual({
      kind: "wrong_mode",
      expected: "555",
      actual: "444",
    });
  });

  // ── Created / deleted files ─────────────────────────────────────────

  test("new file in protected directory appears as created", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    // New file only in staging — doesn't exist on disk
    ops.addDirectory(".soulguard-staging/skills", {
      owner: "agent",
      group: "staff",
      mode: "755",
    });
    ops.addFile(".soulguard-staging/skills/rust.md", "new skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "skills/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(1);
    expect(result.value.changed[0]!.path).toBe("skills/rust.md");
    expect(result.value.changed[0]!.status).toBe("created");
  });

  test("deleted protected file appears as deleted", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    // Delete sentinel in staging
    ops.addFile(
      ".soulguard-staging/SOUL.md",
      JSON.stringify({ __soulguard_delete_sentinel__: true }),
      { owner: "agent", group: "staff", mode: "644" },
    );

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "SOUL.md": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(1);
    expect(result.value.changed[0]!.path).toBe("SOUL.md");
    expect(result.value.changed[0]!.status).toBe("deleted");
  });

  test("deleted file in protected directory appears as deleted", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    // Delete sentinel for one child file
    ops.addDirectory(".soulguard-staging/skills", {
      owner: "agent",
      group: "staff",
      mode: "755",
    });
    ops.addFile(
      ".soulguard-staging/skills/python.md",
      JSON.stringify({ __soulguard_delete_sentinel__: true }),
      { owner: "agent", group: "staff", mode: "644" },
    );

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "skills/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(1);
    expect(result.value.changed[0]!.path).toBe("skills/python.md");
    expect(result.value.changed[0]!.status).toBe("deleted");
  });

  test("deleted protected directory marks all children as deleted", async () => {
    const ops = makeMock();
    ops.addDirectory("memory", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("memory/day1.md", "notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addFile("memory/deep/nested.md", "deep notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    // Directory-level delete sentinel (a file, not a directory, at the staging path)
    ops.addFile(
      ".soulguard-staging/memory",
      JSON.stringify({ __soulguard_delete_sentinel__: true }),
      { owner: "agent", group: "staff", mode: "644" },
    );

    const result = await status(
      opts({ version: 1, guardian: GUARDIAN, files: { "memory/": "protect" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changed).toHaveLength(2);
    const paths = result.value.changed.map((f) => f.path).sort();
    expect(paths).toEqual(["memory/day1.md", "memory/deep/nested.md"]);
    for (const file of result.value.changed) {
      expect(file.status).toBe("deleted");
    }
  });

  // ── formatIssue (lives in types.ts, tested here for convenience) ──

  test("formatIssue produces readable strings", () => {
    const issues: DriftIssue[] = [
      { kind: "wrong_owner", expected: GUARDIAN, actual: "agent" },
      { kind: "wrong_mode", expected: "444", actual: "644" },
    ];
    expect(formatIssue(issues[0]!)).toBe(`owner is agent, expected ${GUARDIAN}`);
    expect(formatIssue(issues[1]!)).toBe("mode is 644, expected 444");
  });
});
