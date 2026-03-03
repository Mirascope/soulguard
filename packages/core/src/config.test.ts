import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { readConfig, ensureConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./constants.js";
import type { SoulguardConfig } from "./types.js";

const testConfig: SoulguardConfig = {
  version: 1,
  files: { "SOUL.md": "protect" },
};

describe("readConfig", () => {
  test("returns parsed config when file exists", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", JSON.stringify(testConfig));

    const result = await readConfig(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(testConfig);
  });

  test("returns not_found when file missing", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await readConfig(ops);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("not_found");
  });

  test("returns parse_failed on malformed JSON", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", "{not valid");

    const result = await readConfig(ops);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("parse_failed");
  });

  test("returns parse_failed on invalid schema", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", JSON.stringify({ version: 99, files: {} }));

    const result = await readConfig(ops);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("parse_failed");
  });
});

describe("ensureConfig", () => {
  test("reads existing config, created=false", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", JSON.stringify(testConfig));

    const result = await ensureConfig(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(false);
    expect(result.value.config).toEqual(testConfig);
  });

  test("writes default config when missing, created=true", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await ensureConfig(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(result.value.config).toEqual(DEFAULT_CONFIG);

    // Verify file contents match default config
    const raw = await ops.readFile("soulguard.json");
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    expect(raw.value).toBe(JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  });

  test("returns error on malformed existing config", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", "{bad json");

    const result = await ensureConfig(ops);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("parse_failed");
  });
});
