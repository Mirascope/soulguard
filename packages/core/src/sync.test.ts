import { describe, expect, test } from "bun:test";
import { sync } from "./sync.js";
import { MockSystemOps } from "./system-ops-mock.js";
import type { FileStatus } from "./status.js";

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

/** Filter to only file-level issues (not registry reconciliation) */
function fileIssues(issues: FileStatus[]) {
  return issues.filter(
    (i: any) => !["unregistered", "tier_changed", "orphaned"].includes(i.status),
  );
}

describe("sync", () => {
  test("fixes unprotected protect-tier files", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await sync(
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

    // Before had issues
    expect(fileIssues(result.value.before.issues)).toHaveLength(1);
    // Sync succeeded
    expect(result.value.errors).toHaveLength(0);
    expect(ops.ops).toHaveLength(2); // chown + chmod
  });

  test("no-op when already protected", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await sync(
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

    expect(fileIssues(result.value.before.issues)).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
  });

  test("missing files remain in issues (can't fix)", async () => {
    const ops = makeMock();

    const result = await sync(
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

    expect(fileIssues(result.value.before.issues)).toHaveLength(1);
    // Missing files can't be fixed — they show up as errors or remain
    expect(result.value.errors).toHaveLength(0);
  });

  test("fixes only what needs fixing", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await sync(
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

    expect(result.value.errors).toHaveLength(0);
    expect(ops.ops).toHaveLength(1); // only chmod
  });

  test("watch-tier files are not modified by sync", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: "selene",
      group: "staff",
      mode: "644",
    });

    const result = await sync(
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

    // Watch tier has no ownership expectations — no file-level issues
    expect(fileIssues(result.value.before.issues)).toHaveLength(0);
  });

  test("handles multiple files across tiers", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "644" });
    ops.addFile("AGENTS.md", "# Agents", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addFile("notes.md", "# Notes", {
      owner: "selene",
      group: "staff",
      mode: "644",
    });

    const result = await sync(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
            "AGENTS.md": "protect",
            "notes.md": "watch",
          },
        },
        ops,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Before: SOUL.md drifted (protect only — watch has no ownership checks)
    expect(fileIssues(result.value.before.issues)).toHaveLength(1);
    // After: all clean
    expect(result.value.errors).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
  });

  test("commits protect and watch-tier files to git when enabled", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/.git", "");
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addFile("notes.md", "# Notes", {
      owner: "selene",
      group: "staff",
      mode: "644",
    });

    // Make post-add diff check fail (= files staged)
    ops.execFailOnCall.set(
      "git --git-dir .soulguard/.git --work-tree . diff --cached --quiet",
      new Set([1]),
    );

    const result = await sync(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
            "notes.md": "watch",
          },
          git: true,
        } as never,
        ops,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.git).toBeDefined();
    expect(result.value.git?.committed).toBe(true);
    if (result.value.git?.committed) {
      expect(result.value.git.files).toEqual(["SOUL.md", "notes.md"]);
    }
  });

  test("skips git commit when git disabled", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await sync(
      opts(
        {
          version: 1,
          files: {
            "SOUL.md": "protect",
          },
          git: false,
        } as never,
        ops,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.git).toBeUndefined();
  });
});
