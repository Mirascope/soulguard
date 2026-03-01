import { describe, test, expect } from "bun:test";
import { isProtectedFile, normalizePath } from "./protect-check.js";

describe("isProtectedFile", () => {
  test("exact match", () => {
    expect(isProtectedFile(["SOUL.md"], "SOUL.md")).toBe(true);
    expect(isProtectedFile(["SOUL.md"], "AGENTS.md")).toBe(false);
  });

  test("normalizes leading ./ and /", () => {
    expect(isProtectedFile(["SOUL.md"], "./SOUL.md")).toBe(true);
    expect(isProtectedFile(["./SOUL.md"], "SOUL.md")).toBe(true);
  });

  test("glob * matches single segment", () => {
    expect(isProtectedFile(["memory/*.md"], "memory/day1.md")).toBe(true);
    expect(isProtectedFile(["memory/*.md"], "memory/archive/old.md")).toBe(false);
    expect(isProtectedFile(["*.md"], "SOUL.md")).toBe(true);
  });

  test("glob ** matches nested paths", () => {
    expect(isProtectedFile(["memory/**"], "memory/day1.md")).toBe(true);
    expect(isProtectedFile(["memory/**"], "memory/archive/old.md")).toBe(true);
    expect(isProtectedFile(["skills/**"], "memory/day1.md")).toBe(false);
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
