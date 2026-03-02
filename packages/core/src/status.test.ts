import { describe, expect, test } from "bun:test";
import { status } from "./status.js";
import { MockSystemOps } from "./system-ops-mock.js";
import type { FileStatus } from "./status.js";
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

function opts(
  config: { version: 1; files: Record<string, "protect" | "watch"> },
  ops: MockSystemOps,
) {
  return {
    config,
    expectedProtectOwnership: VAULT_OWNERSHIP,
    ops,
  };
}

describe("status", () => {
  test("reports ok when protect-tier file is correct", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.protect).toHaveLength(1);
    expect(result.value.protect[0]!.status).toBe("ok");
    expect(result.value.issues).toHaveLength(0);
  });

  test("reports drifted with semantic issues when protect-tier file has wrong owner", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.protect[0]! as FileStatus & { status: "drifted" };
    expect(file.status).toBe("drifted");
    expect(file.issues).toContainEqual({
      kind: "wrong_owner",
      expected: VAULT_OWNERSHIP.user,
      actual: "agent",
    });
    expect(result.value.issues).toHaveLength(1);
  });

  test("reports drifted when protect-tier file has wrong mode", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.protect[0]! as FileStatus & { status: "drifted" };
    expect(file.status).toBe("drifted");
    expect(file.issues).toContainEqual({
      kind: "wrong_mode",
      expected: "444",
      actual: "644",
    });
  });

  test("reports missing protect-tier files", async () => {
    const ops = makeMock();

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.protect[0]!.status).toBe("missing");
    expect(result.value.issues).toHaveLength(1);
  });

  test("includes hashes in FileInfo for ok files", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.protect[0]! as FileStatus & { status: "ok" };
    expect(file.file.hash).toMatch(/^[a-f0-9]{64}$/);
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
      opts(
        {
          version: 1,
          files: {
            "memory/**": "protect",
            "skills/**": "watch",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.protect).toHaveLength(1);
    expect(result.value.protect[0]!.status).toBe("ok");
    expect(result.value.watch).toHaveLength(1);
    expect(result.value.watch[0]!.status).toBe("ok");
    expect(result.value.issues).toHaveLength(0);
  });

  test("glob with no matches returns empty", async () => {
    const ops = makeMock();

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "memory/**": "protect",
            "skills/**": "watch",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.protect).toHaveLength(0);
    expect(result.value.watch).toHaveLength(0);
  });

  test("reports multiple semantic issues on same file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: "staff",
      mode: "777",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.protect[0]! as FileStatus & { status: "drifted" };
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

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
            "notes.md": "watch",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(2);
  });

  test("watch ok files include FileInfo", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: "selene",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "notes.md": "watch",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.watch[0]! as FileStatus & { status: "ok" };
    expect(file.status).toBe("ok");
    expect(file.file.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(file.file.ownership.user).toBe("selene");
  });

  test("watch-tier file reports ok regardless of ownership", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts(
        {
          version: 1,
          files: {
            "notes.md": "watch",
          },
        },
        ops,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const file = result.value.watch[0]!;
    expect(file.status).toBe("ok");
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
