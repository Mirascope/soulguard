import { describe, expect, test } from "bun:test";
import { create } from "./create.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { STAGING_DIR } from "./staging.js";

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
    "skills/": "protect" as const,
  },
};

describe("create", () => {
  test("creates empty staging file for new file in protect tier", async () => {
    const ops = makeMock();
    // skills/ directory exists but skills/new.md does not
    ops.addFile("skills/python.md", "# Python", {
      owner: GUARDIAN,
      group: "soulguard",
      mode: "444",
    });

    const result = await create({ ops, config: baseConfig, path: "skills/new.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.path).toBe("skills/new.md");
    expect(result.value.alreadyExisted).toBe(false);

    // Verify staging file was created
    const staging = await ops.readFile(`${STAGING_DIR}/skills/new.md`);
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(staging.value).toBe("");
    }
  });

  test("errors when path is not in protect tier", async () => {
    const ops = makeMock();

    const result = await create({ ops, config: baseConfig, path: "random.md" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("not_in_protect_tier");
  });

  test("returns alreadyExisted when file exists on disk", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: GUARDIAN, group: "soulguard", mode: "444" });

    const result = await create({ ops, config: baseConfig, path: "SOUL.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alreadyExisted).toBe(true);
  });

  test("creates staging for nested path with parent dirs", async () => {
    const ops = makeMock();

    const result = await create({ ops, config: baseConfig, path: "skills/advanced/new.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.path).toBe("skills/advanced/new.md");

    const staging = await ops.readFile(`${STAGING_DIR}/skills/advanced/new.md`);
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(staging.value).toBe("");
    }
  });
});
