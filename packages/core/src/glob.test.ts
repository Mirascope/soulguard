import { describe, test, expect } from "bun:test";
import { isGlob, matchGlob, createGlobMatcher } from "./glob.js";

describe("isGlob", () => {
  test("returns true for patterns with *", () => {
    expect(isGlob("*.md")).toBe(true);
    expect(isGlob("memory/*.md")).toBe(true);
    expect(isGlob("**/*.ts")).toBe(true);
  });

  test("returns false for literal paths", () => {
    expect(isGlob("SOUL.md")).toBe(false);
    expect(isGlob("memory/2026-01-01.md")).toBe(false);
  });
});

describe("matchGlob", () => {
  test("* matches single segment", () => {
    expect(matchGlob("*.md", "SOUL.md")).toBe(true);
    expect(matchGlob("*.md", "README.md")).toBe(true);
    expect(matchGlob("*.md", "src/SOUL.md")).toBe(false);
    expect(matchGlob("*.ts", "SOUL.md")).toBe(false);
  });

  test("* in directory", () => {
    expect(matchGlob("memory/*.md", "memory/day1.md")).toBe(true);
    expect(matchGlob("memory/*.md", "memory/deep/day1.md")).toBe(false);
    expect(matchGlob("memory/*.md", "other/day1.md")).toBe(false);
  });

  test("** matches any depth", () => {
    expect(matchGlob("src/**", "src/a.ts")).toBe(true);
    expect(matchGlob("src/**", "src/deep/a.ts")).toBe(true);
    expect(matchGlob("src/**", "other/a.ts")).toBe(false);
  });

  test("**/*.ext matches files at any depth", () => {
    expect(matchGlob("**/*.md", "README.md")).toBe(true);
    expect(matchGlob("**/*.md", "docs/guide.md")).toBe(true);
    expect(matchGlob("**/*.md", "deep/nested/file.md")).toBe(true);
    expect(matchGlob("**/*.md", "file.ts")).toBe(false);
  });

  test("/**/  matches zero or more directories", () => {
    // src/**/*.ts should match src/main.ts (zero intermediate dirs)
    expect(matchGlob("src/**/*.ts", "src/main.ts")).toBe(true);
    // and also deeper paths
    expect(matchGlob("src/**/*.ts", "src/utils/math.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "src/a/b/c.ts")).toBe(true);
    // but not non-matching
    expect(matchGlob("src/**/*.ts", "test/main.ts")).toBe(false);
  });

  test("exact match for non-glob patterns", () => {
    expect(matchGlob("SOUL.md", "SOUL.md")).toBe(true);
    expect(matchGlob("SOUL.md", "OTHER.md")).toBe(false);
  });
});

describe("createGlobMatcher", () => {
  test("returns reusable matcher function", () => {
    const matcher = createGlobMatcher("*.md");
    expect(matcher("SOUL.md")).toBe(true);
    expect(matcher("README.md")).toBe(true);
    expect(matcher("file.ts")).toBe(false);
  });

  test("compiles once for repeated use", () => {
    const matcher = createGlobMatcher("src/**/*.ts");
    const paths = ["src/a.ts", "src/b/c.ts", "test/d.ts", "src/e.md"];
    const results = paths.filter(matcher);
    expect(results).toEqual(["src/a.ts", "src/b/c.ts"]);
  });
});
