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

  test("directory protection covers files inside", () => {
    expect(isProtectedFile(["memory"], "memory/day1.md")).toBe(true);
    expect(isProtectedFile(["memory/"], "memory/day1.md")).toBe(true);
    expect(isProtectedFile(["memory"], "memory/archive/old.md")).toBe(true);
    expect(isProtectedFile(["skills"], "memory/day1.md")).toBe(false);
  });

  test("directory protection normalizes trailing slash", () => {
    expect(isProtectedFile(["skills/"], "skills/python.md")).toBe(true);
    expect(isProtectedFile(["skills"], "skills/python.md")).toBe(true);
  });
});

describe("normalizePath", () => {
  test("strips leading ./", () => {
    expect(normalizePath("./SOUL.md")).toBe("SOUL.md");
  });

  test("strips leading /", () => {
    expect(normalizePath("/SOUL.md")).toBe("SOUL.md");
  });

  test("strips trailing /", () => {
    expect(normalizePath("skills/")).toBe("skills");
  });

  test("passes through normal paths", () => {
    expect(normalizePath("SOUL.md")).toBe("SOUL.md");
    expect(normalizePath("memory/day1.md")).toBe("memory/day1.md");
  });
});
