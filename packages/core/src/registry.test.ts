import { describe, expect, test } from "bun:test";
import { MockSystemOps } from "./system-ops-mock.js";
import { Registry } from "./registry.js";

const WORKSPACE = "/test/workspace";

describe("Registry", () => {
  test("load returns empty registry when file doesn't exist", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toData()).toEqual({ version: 1, files: {} });
  });

  test("load parses valid registry with protect entry", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile(
      ".soulguard/registry.json",
      JSON.stringify({
        version: 1,
        files: {
          "SOUL.md": {
            tier: "protect",
            originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
          },
        },
      }),
      { owner: "root", group: "root", mode: "644" },
    );
    const result = await Registry.load(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.get("SOUL.md");
    expect(entry?.tier).toBe("protect");
    if (entry?.tier === "protect") {
      expect(entry.originalOwnership.user).toBe("dandelion");
    }
  });

  test("load parses valid registry with watch entry", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile(
      ".soulguard/registry.json",
      JSON.stringify({
        version: 1,
        files: {
          "notes.md": { tier: "watch" },
        },
      }),
      { owner: "root", group: "root", mode: "644" },
    );
    const result = await Registry.load(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.get("notes.md");
    expect(entry?.tier).toBe("watch");
  });

  test("register snapshots ownership for protect tier", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("SOUL.md", "# Soul", { owner: "dandelion", group: "staff", mode: "644" });

    const result = await Registry.load(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reg = result.value;

    const ok = await reg.register("SOUL.md", "protect");
    expect(ok).toBe(true);
    const entry = reg.get("SOUL.md");
    expect(entry?.tier).toBe("protect");
    if (entry?.tier === "protect") {
      expect(entry.originalOwnership).toEqual({
        user: "dandelion",
        group: "staff",
        mode: "644",
      });
    }
  });

  test("register watch tier has no originalOwnership", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("notes.md", "# Notes", { owner: "dandelion", group: "staff", mode: "644" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    await reg.register("notes.md", "watch");
    const entry = reg.get("notes.md");
    expect(entry).toEqual({ tier: "watch" });
  });

  test("register protect returns false if file doesn't exist", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    const ok = await reg.register("NOPE.md", "protect");
    expect(ok).toBe(false);
    expect(reg.get("NOPE.md")).toBeUndefined();
  });

  test("register is no-op for same tier", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("SOUL.md", "# Soul", { owner: "dandelion", group: "staff", mode: "644" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    await reg.register("SOUL.md", "protect");
    const entry = reg.get("SOUL.md");
    if (entry?.tier !== "protect") return;
    const original = entry.originalOwnership;

    // Re-register at same tier — should keep original
    ops.addFile("SOUL.md", "# Soul v2", { owner: "soulguardian", group: "soulguard", mode: "444" });
    await reg.register("SOUL.md", "protect");
    const entry2 = reg.get("SOUL.md");
    if (entry2?.tier !== "protect") return;
    expect(entry2.originalOwnership).toEqual(original);
  });

  test("updateTier protect→watch produces watch entry", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("SOUL.md", "# Soul", { owner: "soulguardian", group: "soulguard", mode: "444" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    // Set up a protect entry
    reg.toData().files["SOUL.md"] = {
      tier: "protect",
      kind: "file",
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };

    await reg.updateTier("SOUL.md", "watch");
    expect(reg.get("SOUL.md")).toEqual({ tier: "watch" });
  });

  test("updateTier watch→protect snapshots current ownership", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("notes.md", "# Notes", { owner: "agent", group: "staff", mode: "644" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    reg.toData().files["notes.md"] = { tier: "watch" };

    await reg.updateTier("notes.md", "protect");
    const entry = reg.get("notes.md");
    expect(entry?.tier).toBe("protect");
    if (entry?.tier === "protect") {
      expect(entry.originalOwnership).toEqual({
        user: "agent",
        group: "staff",
        mode: "644",
      });
    }
  });

  test("unregister removes entry and returns it", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    reg.toData().files["SOUL.md"] = {
      tier: "protect",
      kind: "file",
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };

    const entry = reg.unregister("SOUL.md");
    expect(entry).toBeDefined();
    if (entry?.tier === "protect") {
      expect(entry.originalOwnership.user).toBe("dandelion");
    }
    expect(reg.get("SOUL.md")).toBeUndefined();
  });

  test("unregister returns undefined for unknown file", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    if (!result.ok) return;

    const entry = result.value.unregister("NOPE.md");
    expect(entry).toBeUndefined();
  });

  test("findOrphaned identifies files no longer in config", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    reg.toData().files["SOUL.md"] = {
      tier: "protect",
      kind: "file",
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };
    reg.toData().files["OLD.md"] = {
      tier: "protect",
      kind: "file",
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };

    const orphaned = reg.findOrphaned(["SOUL.md"]);
    expect(orphaned).toEqual(["OLD.md"]);
  });

  test("write persists to disk", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    if (!result.ok) return;

    await result.value.register("SOUL.md", "watch");
    const writeResult = await result.value.write();
    expect(writeResult.ok).toBe(true);
  });
});
