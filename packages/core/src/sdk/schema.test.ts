import { describe, expect, test } from "bun:test";
import { parseConfig } from "./schema.js";

describe("soulguardConfigSchema", () => {
  test("parses valid config", () => {
    const config = parseConfig({
      version: 1,
      guardian: "soulguardian_agent",
      files: {
        "SOUL.md": "protect",
        "AGENTS.md": "protect",
        "memory/**": "watch",
      },
    });
    expect(config.files).toEqual({
      "SOUL.md": "protect",
      "AGENTS.md": "protect",
      "memory/**": "watch",
    });
  });

  test("rejects missing files", () => {
    expect(() => parseConfig({ version: 1, guardian: "soulguardian_agent" })).toThrow();
  });

  test("rejects invalid tier value", () => {
    expect(() =>
      parseConfig({ version: 1, guardian: "soulguardian_agent", files: { "SOUL.md": "invalid" } }),
    ).toThrow();
  });

  test("rejects missing guardian", () => {
    expect(() => parseConfig({ version: 1, files: {} })).toThrow();
  });

  test("accepts empty files map", () => {
    const config = parseConfig({ version: 1, guardian: "soulguardian_agent", files: {} });
    expect(config.files).toEqual({});
  });
});
