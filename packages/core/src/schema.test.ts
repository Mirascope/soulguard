import { describe, expect, test } from "bun:test";
import { parseConfig } from "./schema.js";

describe("soulguardConfigSchema", () => {
  test("parses valid config", () => {
    const config = parseConfig({
      vault: ["SOUL.md", "AGENTS.md"],
      ledger: ["memory/**"],
    });
    expect(config.vault).toEqual(["SOUL.md", "AGENTS.md"]);
    expect(config.ledger).toEqual(["memory/**"]);
  });

  test("rejects missing vault", () => {
    expect(() => parseConfig({ ledger: [] })).toThrow();
  });

  test("rejects missing ledger", () => {
    expect(() => parseConfig({ vault: [] })).toThrow();
  });

  test("accepts empty arrays", () => {
    const config = parseConfig({ vault: [], ledger: [] });
    expect(config.vault).toEqual([]);
    expect(config.ledger).toEqual([]);
  });
});
