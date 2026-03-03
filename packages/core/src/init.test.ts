import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { init } from "./init.js";
import type { InitOptions } from "./init.js";
import { DEFAULT_CONFIG } from "./constants.js";

function makeOptions(ops: MockSystemOps, overrides?: Partial<InitOptions>): InitOptions {
  return {
    ops,
    identity: { user: "soulguardian", group: "soulguard" },
    _skipRootCheck: true,
    ...overrides,
  };
}

describe("init", () => {
  test("creates user, group, config, registry", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.groupCreated).toBe(true);
    expect(result.value.userCreated).toBe(true);
    expect(result.value.configCreated).toBe(true);
    expect(result.value.registryCreated).toBe(true);
  });

  test("skips existing user and group", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addUser("soulguardian");
    ops.addGroup("soulguard");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.groupCreated).toBe(false);
    expect(result.value.userCreated).toBe(false);
    expect(result.value.configCreated).toBe(true);
  });

  test("skips existing config and validates it", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(
      "soulguard.json",
      JSON.stringify({ version: 1, files: { "SOUL.md": "protect", "soulguard.json": "protect" } }),
    );

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.configCreated).toBe(false);
  });

  test("fails on malformed config", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", "{not valid json");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("config_invalid");
  });

  test("idempotent — second run skips all steps", async () => {
    const ops = new MockSystemOps("/workspace");

    const first = await init(makeOptions(ops));
    expect(first.ok).toBe(true);

    // Mock doesn't create .soulguard/.git as side effect of exec, so add it
    ops.addFile(".soulguard/.git", "");

    const second = await init(makeOptions(ops));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.groupCreated).toBe(false);
    expect(second.value.userCreated).toBe(false);
    expect(second.value.configCreated).toBe(false);
    expect(second.value.registryCreated).toBe(false);
    expect(second.value.gitInitialized).toBe(false);
  });

  test("does not call sync — files remain unprotected", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });
    ops.addFile(
      "soulguard.json",
      JSON.stringify({ version: 1, files: { "SOUL.md": "protect", "soulguard.json": "protect" } }),
    );

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // SOUL.md should still have original ownership (not soulguardian)
    const stat = await ops.stat("SOUL.md");
    expect(stat.ok).toBe(true);
    if (!stat.ok) return;
    expect(stat.value.ownership.user).toBe("agent");

    // issueCount should be > 0 since files need sync
    expect(result.value.issueCount).toBeGreaterThan(0);
  });

  test("creates .soulguard/ and .soulguard-staging/ directories", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);

    const sgDir = await ops.exists(".soulguard");
    expect(sgDir.ok && sgDir.value).toBe(true);

    const stagingDir = await ops.exists(".soulguard-staging");
    expect(stagingDir.ok && stagingDir.value).toBe(true);
  });

  test("git=true (default) — git init called", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitInitialized).toBe(true);
    const execOps = ops.ops.filter((o) => o.kind === "exec");
    expect(execOps).toContainEqual({
      kind: "exec",
      command: "git",
      args: ["init", "--bare", ".soulguard/.git"],
    });
  });

  test("git=true, existing repo — git init skipped", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(".soulguard/.git", "");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.gitInitialized).toBe(false);
  });

  test("malformed registry bails with registry_invalid", async () => {
    const ops = new MockSystemOps("/workspace");
    // Create .soulguard dir and a bad registry
    ops.addFile(".soulguard/registry.json", "{not valid json");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe("registry_invalid");
  });
});

describe("DEFAULT_CONFIG", () => {
  test("has expected default protect-tier files", () => {
    expect(DEFAULT_CONFIG.files).toEqual({ "soulguard.json": "protect" });
  });
});
