import { describe, expect, test } from "bun:test";
import { setTier, release } from "./tier.js";
import type { SoulguardConfig } from "./types.js";

const baseConfig: SoulguardConfig = {
  version: 1,
  files: {
    "SOUL.md": "protect",
    "soulguard.json": "protect",
    "memory/**": "watch",
  },
};

describe("setTier", () => {
  test("adds new file to protect", () => {
    const result = setTier(baseConfig, ["AGENTS.md"], "protect");
    expect(result.added).toEqual(["AGENTS.md"]);
    expect(result.moved).toEqual([]);
    expect(result.alreadyInTier).toEqual([]);
    expect(result.config.files["AGENTS.md"]).toBe("protect");
  });

  test("moves file from watch to protect", () => {
    const result = setTier(baseConfig, ["memory/**"], "protect");
    expect(result.moved).toEqual(["memory/**"]);
    expect(result.added).toEqual([]);
    expect(result.config.files["memory/**"]).toBe("protect");
  });

  test("reports already-in-tier files", () => {
    const result = setTier(baseConfig, ["SOUL.md"], "protect");
    expect(result.alreadyInTier).toEqual(["SOUL.md"]);
    expect(result.added).toEqual([]);
    expect(result.moved).toEqual([]);
  });

  test("adds new file to watch", () => {
    const result = setTier(baseConfig, ["logs/**"], "watch");
    expect(result.added).toEqual(["logs/**"]);
    expect(result.config.files["logs/**"]).toBe("watch");
  });

  test("moves file from protect to watch", () => {
    const result = setTier(baseConfig, ["SOUL.md"], "watch");
    expect(result.moved).toEqual(["SOUL.md"]);
    expect(result.config.files["SOUL.md"]).toBe("watch");
  });

  test("handles mix of add, move, and already-in-tier", () => {
    const result = setTier(baseConfig, ["SOUL.md", "memory/**", "NEW.md"], "protect");
    expect(result.alreadyInTier).toEqual(["SOUL.md"]);
    expect(result.moved).toEqual(["memory/**"]);
    expect(result.added).toEqual(["NEW.md"]);
  });

  test("does not mutate original config", () => {
    const originalFiles = { ...baseConfig.files };
    setTier(baseConfig, ["NEW.md"], "protect");
    expect(baseConfig.files).toEqual(originalFiles);
  });
});

describe("release", () => {
  test("releases file from protect", () => {
    const result = release(baseConfig, ["SOUL.md"]);
    expect(result.released).toEqual(["SOUL.md"]);
    expect(result.notTracked).toEqual([]);
    expect(result.config.files["SOUL.md"]).toBeUndefined();
  });

  test("releases file from watch", () => {
    const result = release(baseConfig, ["memory/**"]);
    expect(result.released).toEqual(["memory/**"]);
    expect(result.config.files["memory/**"]).toBeUndefined();
  });

  test("reports untracked files", () => {
    const result = release(baseConfig, ["NONEXISTENT.md"]);
    expect(result.notTracked).toEqual(["NONEXISTENT.md"]);
    expect(result.released).toEqual([]);
  });

  test("handles mix of tracked and untracked", () => {
    const result = release(baseConfig, ["SOUL.md", "memory/**", "NOPE.md"]);
    expect(result.released).toEqual(["SOUL.md", "memory/**"]);
    expect(result.notTracked).toEqual(["NOPE.md"]);
  });

  test("does not mutate original config", () => {
    const originalFiles = { ...baseConfig.files };
    release(baseConfig, ["SOUL.md"]);
    expect(baseConfig.files).toEqual(originalFiles);
  });
});
