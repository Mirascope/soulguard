import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { init } from "./init.js";
import type { InitOptions } from "./init.js";

function makeOptions(ops: MockSystemOps, overrides?: Partial<InitOptions>): InitOptions {
  return {
    ops,
    agentUser: "agent",
    _skipRootCheck: true,
    _skipServiceInstall: true,
    ...overrides,
  };
}

describe("init", () => {
  test("creates user, group, config on fresh workspace", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.groupCreated).toBe(true);
    expect(result.value.userCreated).toBe(true);
    expect(result.value.configCreated).toBe(true);
  });

  test("skips existing user and group", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addUser("soulguardian_agent");
    ops.addGroup("soulguard");

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.groupCreated).toBe(false);
    expect(result.value.userCreated).toBe(false);
  });

  test("preserves existing valid config", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile(
      "soulguard.json",
      JSON.stringify({
        version: 1,
        guardian: "soulguardian_agent",
        files: { "SOUL.md": "protect", "soulguard.json": "protect" },
      }),
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

  test("does not enforce protection — files remain unprotected with issueCount > 0", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "# My Soul", { owner: "agent", group: "staff", mode: "644" });
    ops.addFile(
      "soulguard.json",
      JSON.stringify({
        version: 1,
        guardian: "soulguardian_agent",
        files: { "SOUL.md": "protect", "soulguard.json": "protect" },
      }),
    );

    const result = await init(makeOptions(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stat = await ops.stat("SOUL.md");
    expect(stat.ok).toBe(true);
    if (!stat.ok) return;
    expect(stat.value.ownership.user).toBe("agent");
    expect(result.value.issueCount).toBeGreaterThan(0);
  });
});
