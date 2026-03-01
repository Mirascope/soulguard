import { describe, expect, test } from "bun:test";
import { parseConfig } from "./schema.js";

describe("soulguardConfigSchema", () => {
  test("parses valid config", () => {
    const config = parseConfig({
      version: 1,
      protect: ["SOUL.md", "AGENTS.md"],
      watch: ["memory/**"],
    });
    expect(config.protect).toEqual(["SOUL.md", "AGENTS.md"]);
    expect(config.watch).toEqual(["memory/**"]);
  });

  test("rejects missing protect", () => {
    expect(() => parseConfig({ version: 1, watch: [] })).toThrow();
  });

  test("rejects missing watch", () => {
    expect(() => parseConfig({ version: 1, protect: [] })).toThrow();
  });

  test("accepts empty arrays", () => {
    const config = parseConfig({ version: 1, protect: [], watch: [] });
    expect(config.protect).toEqual([]);
    expect(config.watch).toEqual([]);
  });
});
