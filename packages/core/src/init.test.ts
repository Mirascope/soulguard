import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { init, generateSudoers } from "./init.js";
import type { InitOptions } from "./init.js";
import { DEFAULT_CONFIG } from "./constants.js";

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
    config: { version: 1, protect: ["SOUL.md"], watch: [] },
    callerUser: "agent",
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
    ops.addFile("soulguard.json", '{"protect":["SOUL.md"],"watch":[]}');
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.configCreated).toBe(false);
  });

  test("idempotent — second run recreates staging but not system resources", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    // Share absolute state between runs
    const abs = mockAbsolute();
    const opts = makeOptions(ops, { writeAbsolute: abs.writer, existsAbsolute: abs.exists });

    // First run
    const first = await init(opts);
    expect(first.ok).toBe(true);

    // Second run — system resources already exist, staging is recreated
    const second = await init(opts);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.groupCreated).toBe(false);
    expect(second.value.userCreated).toBe(false);
    expect(second.value.configCreated).toBe(false);
    expect(second.value.sudoersCreated).toBe(false);
    // Staging is always recreated (idempotent, self-healing)
    expect(second.value.stagingCreated).toBe(true);
  });

  test("syncs protect-tier files after setup", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Sync should have fixed the protect-tier file ownership
    const afterIssues = result.value.syncResult.after.issues;
    expect(afterIssues.length).toBe(0);
  });

  test("uses DEFAULT_CONFIG when no config provided", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("openclaw.json", "{}", { owner: "agent", group: "staff", mode: "644" });
    ops.addFile("soulguard.json", '{"protect":[],"watch":[]}', {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const { writer, exists } = mockAbsolute();
    const result = await init({
      ops,
      identity: { user: "soulguardian", group: "soulguard" },
      callerUser: "agent",
      writeAbsolute: writer,
      existsAbsolute: exists,
      sudoersPath: "/tmp/test-sudoers",
      _skipRootCheck: true,
      // no config — should use DEFAULT_CONFIG
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Config file already existed so configCreated is false, but sync should
    // have processed the default protect-tier file (soulguard.json)
    expect(result.value.stagingCreated).toBe(true);

    // Verify staging copy was created for the default protect-tier file
    const stagingSoulguard = await ops.exists(".soulguard.soulguard.json");
    expect(stagingSoulguard.ok && stagingSoulguard.value).toBe(true);
  });
});

describe("DEFAULT_CONFIG", () => {
  test("has expected default protect-tier files", () => {
    expect(DEFAULT_CONFIG.protect).toEqual(["soulguard.json"]);
    expect(DEFAULT_CONFIG.watch).toEqual([]);
  });

  test("git=true (default), no existing repo — git init called", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitInitialized).toBe(true);
    // Verify git init was called
    const execOps = ops.ops.filter((o) => o.kind === "exec");
    expect(execOps).toContainEqual({
      kind: "exec",
      command: "git",
      args: ["init", "--bare", ".soulguard/.git"],
    });
  });

  test("git=true, existing repo — git init skipped", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });
    ops.addFile(".soulguard/.git", ""); // simulate existing git repo

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitInitialized).toBe(false);
    const execOps = ops.ops.filter((o) => o.kind === "exec");
    expect(execOps).not.toContainEqual({
      kind: "exec",
      command: "git",
      args: ["init", "--bare", ".soulguard/.git"],
    });
  });

  test("git=false — no git operations", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });

    const result = await init(
      makeOptions(ops, { config: { version: 1, protect: ["SOUL.md"], watch: [], git: false } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitInitialized).toBe(false);
    const gitExecOps = ops.ops.filter((o) => o.kind === "exec" && o.command === "git");
    expect(gitExecOps).toHaveLength(0);
  });
});

describe("generateSudoers", () => {
  test("generates scoped sudoers for agent", () => {
    const content = generateSudoers("agent", "/usr/local/bin/soulguard");
    expect(content).toContain("agent ALL=(root) NOPASSWD:");
    expect(content).toContain("soulguard sync *");
    expect(content).toContain("soulguard reset *");
    expect(content).toContain("soulguard status *");
    expect(content).toContain("soulguard diff *");
    // Should NOT contain approve, init, or propose
    expect(content).not.toContain("approve");
    expect(content).not.toContain("init");
    expect(content).not.toContain("propose");
  });
});
