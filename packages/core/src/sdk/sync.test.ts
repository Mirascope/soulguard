import { describe, expect, test } from "bun:test";
import { sync } from "./sync.js";
import { MockSystemOps } from "../util/system-ops-mock.js";

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
  return { config, ops };
}

describe("sync", () => {
  test("fixes unprotected protected files", async () => {
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

    expect(result.value.drifts).toHaveLength(1);
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

    expect(result.value.drifts).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
  });

  test("missing files are silently skipped", async () => {
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

    expect(result.value.drifts).toHaveLength(0);
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

  test("watched files are not modified by sync", async () => {
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

    expect(result.value.drifts).toHaveLength(0);
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

    expect(result.value.drifts).toHaveLength(1);
    expect(result.value.errors).toHaveLength(0);
  });

  test("commits protected and watched files to git when enabled", async () => {
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
