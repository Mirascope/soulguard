import { describe, expect, test } from "bun:test";
import { deleteStagingEntry } from "./delete.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { DELETE_SENTINEL, STAGING_DIR, isDeleteSentinel } from "./staging.js";

const WORKSPACE = "/test/workspace";
const GUARDIAN = "soulguardian_agent";

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(GUARDIAN);
  ops.addGroup("soulguard");
  return ops;
}

const baseConfig = {
  version: 1 as const,
  guardian: GUARDIAN,
  files: {
    "SOUL.md": "protect" as const,
    "memories/": "protect" as const,
  },
};

describe("deleteStagingEntry", () => {
  test("writes DELETE_SENTINEL for existing protected file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: GUARDIAN, group: "soulguard", mode: "444" });

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "SOUL.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.path).toBe("SOUL.md");

    // Verify DELETE_SENTINEL was written
    const staging = await ops.readFile(`${STAGING_DIR}/SOUL.md`);
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(isDeleteSentinel(staging.value)).toBe(true);
    }
  });

  test("overwrites existing staging copy with DELETE_SENTINEL", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: GUARDIAN, group: "soulguard", mode: "444" });
    ops.addFile(`${STAGING_DIR}/SOUL.md`, "# Modified Soul");

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "SOUL.md" });
    expect(result.ok).toBe(true);

    const staging = await ops.readFile(`${STAGING_DIR}/SOUL.md`);
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(isDeleteSentinel(staging.value)).toBe(true);
    }
  });

  test("errors when already staged for deletion", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: GUARDIAN, group: "soulguard", mode: "444" });
    ops.addFile(`${STAGING_DIR}/SOUL.md`, JSON.stringify(DELETE_SENTINEL, null, 2));

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "SOUL.md" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("already_deleted");
  });

  test("errors when path is not in protect tier", async () => {
    const ops = makeMock();
    ops.addFile("random.md", "# Random");

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "random.md" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("not_in_protect_tier");
  });

  test("errors when path does not exist on disk or in staging", async () => {
    const ops = makeMock();

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "SOUL.md" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("not_found");
  });

  test("works for file with staging copy but no disk file", async () => {
    const ops = makeMock();
    // File only exists in staging (was previously created via `soulguard create`)
    ops.addFile(`${STAGING_DIR}/memories/new.md`, "new content");

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "memories/new.md" });
    expect(result.ok).toBe(true);

    const staging = await ops.readFile(`${STAGING_DIR}/memories/new.md`);
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(isDeleteSentinel(staging.value)).toBe(true);
    }
  });

  test("writes DELETE_SENTINEL for directory path", async () => {
    const ops = makeMock();
    ops.addDirectory("memories/");
    ops.addFile("memories/today.md", "# Today", {
      owner: GUARDIAN,
      group: "soulguard",
      mode: "444",
    });

    const result = await deleteStagingEntry({ ops, config: baseConfig, path: "memories/" });
    expect(result.ok).toBe(true);

    const staging = await ops.readFile(`${STAGING_DIR}/memories/`);
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(isDeleteSentinel(staging.value)).toBe(true);
    }
  });
});
