import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { init, generateSudoers } from "./init.js";
import type { InitOptions } from "./init.js";

/** Mock absolute writer/exists that tracks what was written */
function mockAbsolute(): {
  writer: InitOptions["writeAbsolute"];
  exists: InitOptions["existsAbsolute"];
  written: Map<string, string>;
} {
  const written = new Map<string, string>();
  return {
    writer: async (path, content) => {
      written.set(path, content);
      return { ok: true as const, value: undefined };
    },
    exists: async (path) => written.has(path),
    written,
  };
}

function makeOptions(ops: MockSystemOps, overrides?: Partial<InitOptions>): InitOptions {
  const { writer, exists } = mockAbsolute();
  return {
    ops,
    identity: { user: "soulguardian", group: "soulguard" },
    config: { vault: ["SOUL.md"], ledger: [] },
    agentUser: "agent",
    writeAbsolute: writer,
    existsAbsolute: exists,
    sudoersPath: "/tmp/test-sudoers",
    _skipRootCheck: true,
    ...overrides,
  };
}

describe("init", () => {
  test("creates user, group, config, staging, and sudoers", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.groupCreated).toBe(true);
    expect(result.value.userCreated).toBe(true);
    expect(result.value.configCreated).toBe(true);
    expect(result.value.stagingCreated).toBe(true);
    expect(result.value.sudoersCreated).toBe(true);
  });

  test("skips existing user and group", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addUser("soulguardian");
    ops.addGroup("soulguard");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.groupCreated).toBe(false);
    expect(result.value.userCreated).toBe(false);
    // Config and staging should still be created
    expect(result.value.configCreated).toBe(true);
    expect(result.value.stagingCreated).toBe(true);
  });

  test("skips existing config", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", '{"vault":["SOUL.md"],"ledger":[]}');
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.configCreated).toBe(false);
  });

  test("idempotent — second run creates nothing", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    // Share absolute state between runs
    const abs = mockAbsolute();
    const opts = makeOptions(ops, { writeAbsolute: abs.writer, existsAbsolute: abs.exists });

    // First run
    const first = await init(opts);
    expect(first.ok).toBe(true);

    // Second run — everything should already exist
    const second = await init(opts);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.groupCreated).toBe(false);
    expect(second.value.userCreated).toBe(false);
    expect(second.value.configCreated).toBe(false);
    expect(second.value.sudoersCreated).toBe(false);
    expect(second.value.stagingCreated).toBe(false);
  });

  test("syncs vault files after setup", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Sync should have fixed the vault file ownership
    const afterIssues = result.value.syncResult.after.issues;
    expect(afterIssues.length).toBe(0);
  });
});

describe("generateSudoers", () => {
  test("generates scoped sudoers for agent", () => {
    const content = generateSudoers("agent", "/usr/local/bin/soulguard");
    expect(content).toContain("agent ALL=(root) NOPASSWD:");
    expect(content).toContain("soulguard sync *");
    expect(content).toContain("soulguard stage *");
    expect(content).toContain("soulguard status *");
    expect(content).toContain("soulguard propose *");
    expect(content).toContain("soulguard diff *");
    // Should NOT contain approve or init
    expect(content).not.toContain("approve");
    expect(content).not.toContain("init");
  });
});
