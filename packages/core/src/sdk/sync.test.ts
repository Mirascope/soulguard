import { describe, expect, test } from "bun:test";
import { sync } from "./sync.js";
import { StateTree } from "./state.js";
import { MockSystemOps } from "../util/system-ops-mock.js";

const WORKSPACE = "/test/workspace";
const GUARDIAN = "soulguardian_agent";
const VAULT_OWNERSHIP = { user: GUARDIAN, group: "soulguard", mode: "444" };

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(VAULT_OWNERSHIP.user);
  ops.addGroup(VAULT_OWNERSHIP.group);
  return ops;
}

describe("sync", () => {
  test("fixes unprotected protected files", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "644" });

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "SOUL.md": "protect" as const },
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
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

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "SOUL.md": "protect" as const },
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.drifts).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
  });

  test("missing files are silently skipped", async () => {
    const ops = makeMock();

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "SOUL.md": "protect" as const },
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
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

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "SOUL.md": "protect" as const },
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
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

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "notes.md": "watch" as const },
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
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

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: {
        "SOUL.md": "protect" as const,
        "AGENTS.md": "protect" as const,
        "notes.md": "watch" as const,
      },
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
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

    ops.execFailOnCall.set(
      "git --git-dir .soulguard/.git --work-tree . diff --cached --quiet",
      new Set([1]),
    );

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "SOUL.md": "protect" as const, "notes.md": "watch" as const },
      git: true,
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
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

    const config = {
      version: 1 as const,
      guardian: GUARDIAN,
      files: { "SOUL.md": "protect" as const },
      git: false,
    };
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await sync({ tree, ops, config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.git).toBeUndefined();
  });
});
