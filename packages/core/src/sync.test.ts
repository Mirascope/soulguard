import { describe, expect, test } from "bun:test";
import { sync } from "./sync.js";
import { MockSystemOps } from "./system-ops-mock.js";

const WORKSPACE = "/test/workspace";
const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" };
const LEDGER_OWNERSHIP = { user: "aster", group: "staff", mode: "644" };

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(VAULT_OWNERSHIP.user);
  ops.addGroup(VAULT_OWNERSHIP.group);
  return ops;
}

function opts(config: { version: 1; protect: string[]; watch: string[] }, ops: MockSystemOps) {
  return {
    config,
    expectedProtectOwnership: VAULT_OWNERSHIP,
    expectedWatchOwnership: LEDGER_OWNERSHIP,
    ops,
  };
}

describe("sync", () => {
  test("fixes unprotected protect-tier files", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await sync(opts({ version: 1, protect: ["SOUL.md"], watch: [] }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Before had issues
    expect(result.value.before.issues).toHaveLength(1);
    // After is clean
    expect(result.value.after.issues).toHaveLength(0);
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

    const result = await sync(opts({ version: 1, protect: ["SOUL.md"], watch: [] }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.before.issues).toHaveLength(0);
    expect(result.value.after.issues).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
    expect(ops.ops).toHaveLength(0);
  });

  test("missing files remain in issues (can't fix)", async () => {
    const ops = makeMock();

    const result = await sync(opts({ version: 1, protect: ["SOUL.md"], watch: [] }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.before.issues).toHaveLength(1);
    expect(result.value.after.issues).toHaveLength(1); // still missing
    expect(result.value.errors).toHaveLength(0);
  });

  test("fixes only what needs fixing", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await sync(opts({ version: 1, protect: ["SOUL.md"], watch: [] }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.after.issues).toHaveLength(0);
    expect(ops.ops).toHaveLength(1); // only chmod
  });

  test("releases watch-tier files owned by soulguardian", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await sync(opts({ version: 1, protect: [], watch: ["notes.md"] }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.before.issues).toHaveLength(1);
    expect(result.value.after.issues).toHaveLength(0);
    expect(ops.ops).toHaveLength(2); // chown + chmod
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
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await sync(
      opts({ version: 1, protect: ["SOUL.md", "AGENTS.md"], watch: ["notes.md"] }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Before: SOUL.md drifted (protect), notes.md drifted (watch)
    expect(result.value.before.issues).toHaveLength(2);
    // After: all clean
    expect(result.value.after.issues).toHaveLength(0);
    expect(result.value.errors).toHaveLength(0);
  });

  test("commits protect and watch-tier files to git when enabled", async () => {
    const ops = makeMock();
    ops.addFile(".git", "");
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addFile("notes.md", "# Notes", {
      owner: LEDGER_OWNERSHIP.user,
      group: LEDGER_OWNERSHIP.group,
      mode: LEDGER_OWNERSHIP.mode,
    });

    // Make post-add diff check fail (= files staged)
    ops.execFailOnCall.set("git diff --cached --quiet", new Set([1]));

    const result = await sync(
      opts({ version: 1, protect: ["SOUL.md"], watch: ["notes.md"], git: true } as never, ops),
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
      opts({ version: 1, protect: ["SOUL.md"], watch: [], git: false } as never, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.git).toBeUndefined();
  });
});
