import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { reset } from "./reset.js";
import { StateTree } from "./state.js";
import type { SoulguardConfig } from "../util/types.js";

const GUARDIAN = "soulguardian_agent";

const config: SoulguardConfig = {
  version: 1,
  guardian: GUARDIAN,
  files: {
    "SOUL.md": "protect",
    "skills/": "protect",
  },
};

function setup() {
  const ops = new MockSystemOps("/workspace");
  ops.addFile("SOUL.md", "original soul", {
    owner: GUARDIAN,
    group: "soulguard",
    mode: "444",
  });
  ops.addDirectory("skills", {
    owner: GUARDIAN,
    group: "soulguard",
    mode: "555",
  });
  ops.addFile("skills/python.md", "python skill on disk", {
    owner: GUARDIAN,
    group: "soulguard",
    mode: "444",
  });
  ops.addDirectory(".soulguard-staging");
  ops.addDirectory(".soulguard-staging/skills");
  ops.addFile(".soulguard-staging/SOUL.md", "modified soul", {
    owner: "agent",
    group: "soulguard",
    mode: "644",
  });
  ops.addFile(".soulguard-staging/skills/python.md", "python skill", {
    owner: "agent",
    group: "soulguard",
    mode: "644",
  });
  return ops;
}

describe("reset", () => {
  test("dry run lists staged files when no args", async () => {
    const ops = setup();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await reset({ tree, ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(false);
    expect(result.value.stagedFiles.sort()).toEqual(["SOUL.md", "skills/python.md"]);

    // Files should still exist
    const soul = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(soul.ok).toBe(true);
  });

  test("reset specific file removes only that staging copy", async () => {
    const ops = setup();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await reset({ tree, ops, paths: ["SOUL.md"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(true);
    expect(result.value.stagedFiles).toEqual(["SOUL.md"]);

    // SOUL.md staging copy gone
    const soul = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(soul.ok).toBe(false);

    // Other file still exists
    const python = await ops.readFile(".soulguard-staging/skills/python.md");
    expect(python.ok).toBe(true);
  });

  test("reset --all removes all staging contents", async () => {
    const ops = setup();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await reset({ tree, ops, all: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(true);
    expect(result.value.stagedFiles.sort()).toEqual(["SOUL.md", "skills/python.md"]);

    // Both gone
    const soul = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(soul.ok).toBe(false);
    const python = await ops.readFile(".soulguard-staging/skills/python.md");
    expect(python.ok).toBe(false);
  });

  test("returns empty when nothing staged", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "original", { owner: GUARDIAN, group: "soulguard", mode: "444" });

    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await reset({ tree, ops });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stagedFiles).toEqual([]);
    expect(result.value.deleted).toBe(false);
  });

  test("reset nonexistent path is no-op", async () => {
    const ops = setup();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await reset({ tree, ops, paths: ["nonexistent.md"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stagedFiles).toEqual([]);
    expect(result.value.deleted).toBe(true);
  });

  test("reset directory removes all files under it", async () => {
    const ops = setup();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const result = await reset({ tree, ops, paths: ["skills"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deleted).toBe(true);
    expect(result.value.stagedFiles).toEqual(["skills/python.md"]);

    // skills/python.md gone
    const python = await ops.readFile(".soulguard-staging/skills/python.md");
    expect(python.ok).toBe(false);

    // SOUL.md still exists
    const soul = await ops.readFile(".soulguard-staging/SOUL.md");
    expect(soul.ok).toBe(true);
  });
});
