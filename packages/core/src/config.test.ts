import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { readConfig, ensureConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./constants.js";

describe("readConfig", () => {
  test("returns parsed config when file exists", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("soulguard.json", JSON.stringify({ version: 1, files: { "SOUL.md": "protect" } }));

    const result = await readConfig(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files["SOUL.md"]).toBe("protect");
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
    ops.addFile("soulguard.json", JSON.stringify({ version: 1, files: { "SOUL.md": "protect" } }));

    const result = await ensureConfig(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(false);
    expect(result.value.config.files["SOUL.md"]).toBe("protect");
  });

  test("writes default config when missing, created=true", async () => {
    const ops = new MockSystemOps("/workspace");

    const result = await ensureConfig(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(result.value.config).toEqual(DEFAULT_CONFIG);

    // Verify file was written
    const exists = await ops.exists("soulguard.json");
    expect(exists.ok && exists.value).toBe(true);
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
