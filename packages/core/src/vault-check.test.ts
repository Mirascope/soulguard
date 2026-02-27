import { describe, test, expect } from "bun:test";
import { isVaultedFile, normalizePath } from "./vault-check.js";

describe("isVaultedFile", () => {
  test("exact match", () => {
    expect(isVaultedFile(["SOUL.md"], "SOUL.md")).toBe(true);
    expect(isVaultedFile(["SOUL.md"], "AGENTS.md")).toBe(false);
  });

  test("normalizes leading ./ and /", () => {
    expect(isVaultedFile(["SOUL.md"], "./SOUL.md")).toBe(true);
    expect(isVaultedFile(["./SOUL.md"], "SOUL.md")).toBe(true);
  });

  test("glob * matches single segment", () => {
    expect(isVaultedFile(["memory/*.md"], "memory/day1.md")).toBe(true);
    expect(isVaultedFile(["memory/*.md"], "memory/archive/old.md")).toBe(false);
    expect(isVaultedFile(["*.md"], "SOUL.md")).toBe(true);
  });

  test("glob ** matches nested paths", () => {
    expect(isVaultedFile(["memory/**"], "memory/day1.md")).toBe(true);
    expect(isVaultedFile(["memory/**"], "memory/archive/old.md")).toBe(true);
    expect(isVaultedFile(["skills/**"], "memory/day1.md")).toBe(false);
  });
});

describe("normalizePath", () => {
  test("strips leading ./", () => {
    expect(normalizePath("./SOUL.md")).toBe("SOUL.md");
  });

  test("strips leading /", () => {
    expect(normalizePath("/SOUL.md")).toBe("SOUL.md");
  });

  test("passes through normal paths", () => {
    expect(normalizePath("SOUL.md")).toBe("SOUL.md");
    expect(normalizePath("memory/day1.md")).toBe("memory/day1.md");
  });
});
