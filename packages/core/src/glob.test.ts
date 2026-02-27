import { describe, test, expect } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { isGlob, resolvePatterns } from "./glob.js";

describe("isGlob", () => {
  test("returns true for patterns with *", () => {
    expect(isGlob("memory/*.md")).toBe(true);
    expect(isGlob("skills/**")).toBe(true);
    expect(isGlob("*.md")).toBe(true);
  });

  test("returns false for literal paths", () => {
    expect(isGlob("SOUL.md")).toBe(false);
    expect(isGlob("memory/day1.md")).toBe(false);
    expect(isGlob("soulguard.json")).toBe(false);
  });
});

describe("resolvePatterns", () => {
  test("literal paths pass through as-is", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await resolvePatterns(ops, ["SOUL.md", "AGENTS.md"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["AGENTS.md", "SOUL.md"]);
  });

  test("glob patterns expand to matching files", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile("memory/day2.md", "more notes");
    ops.addFile("memory/archive/old.md", "archived");

    const result = await resolvePatterns(ops, ["memory/*.md"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["memory/day1.md", "memory/day2.md"]);
  });

  test("** matches nested paths", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("memory/day1.md", "notes");
    ops.addFile("memory/archive/old.md", "archived");

    const result = await resolvePatterns(ops, ["memory/**"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["memory/archive/old.md", "memory/day1.md"]);
  });

  test("mixed literal and glob patterns", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "soul");
    ops.addFile("memory/day1.md", "notes");

    const result = await resolvePatterns(ops, ["SOUL.md", "memory/*.md"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["SOUL.md", "memory/day1.md"]);
  });

  test("glob with no matches returns only literals", async () => {
    const ops = new MockSystemOps("/workspace");
    const result = await resolvePatterns(ops, ["SOUL.md", "memory/*.md"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["SOUL.md"]);
  });

  test("deduplicates when glob matches a literal", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("memory/day1.md", "notes");

    const result = await resolvePatterns(ops, ["memory/day1.md", "memory/*.md"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["memory/day1.md"]);
  });
});
