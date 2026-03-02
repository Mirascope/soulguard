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

  test("load parses valid registry", async () => {
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
    expect(result.value.get("SOUL.md")?.tier).toBe("protect");
    expect(result.value.get("SOUL.md")?.originalOwnership?.user).toBe("dandelion");
  });

  test("register snapshots ownership for protect tier", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("SOUL.md", "# Soul", { owner: "dandelion", group: "staff", mode: "644" });

    const result = await Registry.load(ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reg = result.value;

    await reg.register("SOUL.md", "protect");
    expect(reg.get("SOUL.md")?.tier).toBe("protect");
    expect(reg.get("SOUL.md")?.originalOwnership).toEqual({
      user: "dandelion",
      group: "staff",
      mode: "644",
    });
  });

  test("register does NOT snapshot ownership for watch tier", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("notes.md", "# Notes", { owner: "dandelion", group: "staff", mode: "644" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    await reg.register("notes.md", "watch");
    expect(reg.get("notes.md")?.tier).toBe("watch");
    expect(reg.get("notes.md")?.originalOwnership).toBeUndefined();
  });

  test("register is no-op for same tier", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("SOUL.md", "# Soul v2", { owner: "soulguardian", group: "soulguard", mode: "444" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    // Pre-populate
    ops.addFile("SOUL.md", "# Soul", { owner: "dandelion", group: "staff", mode: "644" });
    await reg.register("SOUL.md", "protect");
    const original = reg.get("SOUL.md")?.originalOwnership;

    // Re-register at same tier — should keep original
    ops.addFile("SOUL.md", "# Soul v2", { owner: "soulguardian", group: "soulguard", mode: "444" });
    await reg.register("SOUL.md", "protect");
    expect(reg.get("SOUL.md")?.originalOwnership).toEqual(original);
  });

  test("updateTier preserves originalOwnership", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    ops.addFile("SOUL.md", "# Soul", { owner: "soulguardian", group: "soulguard", mode: "444" });

    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    // Manually set up an entry with known originalOwnership
    await reg.register("SOUL.md", "protect");
    // Override to simulate pre-soulguard ownership
    reg.toData().files["SOUL.md"] = {
      tier: "protect",
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };

    await reg.updateTier("SOUL.md", "watch");
    expect(reg.get("SOUL.md")?.tier).toBe("watch");
    expect(reg.get("SOUL.md")?.originalOwnership?.user).toBe("dandelion");
  });

  test("unregister removes entry and returns it", async () => {
    const ops = new MockSystemOps(WORKSPACE);
    const result = await Registry.load(ops);
    if (!result.ok) return;
    const reg = result.value;

    reg.toData().files["SOUL.md"] = {
      tier: "protect",
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };

    const entry = reg.unregister("SOUL.md");
    expect(entry).toBeDefined();
    expect(entry?.originalOwnership?.user).toBe("dandelion");
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
      originalOwnership: { user: "dandelion", group: "staff", mode: "644" },
    };
    reg.toData().files["OLD.md"] = {
      tier: "protect",
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
