import { describe, expect, test } from "bun:test";
import { status } from "./status.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { formatIssue } from "../util/types.js";
import type { DriftIssue } from "../util/types.js";

const WORKSPACE = "/test/workspace";
const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" };

function makeMock() {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addUser(VAULT_OWNERSHIP.user);
  ops.addGroup(VAULT_OWNERSHIP.group);
  return ops;
}

function opts(
  config: { version: 1; files: Record<string, "protect" | "watch"> },
  ops: MockSystemOps,
) {
  return {
    config,
    expectedProtectOwnership: VAULT_OWNERSHIP,
    ops,
  };
}

describe("status", () => {
  test("no issues when protect-tier file is correct", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(0);
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.status).toBe("ok");
    expect(result.value.files[0]!.path).toBe("SOUL.md");
  });

  test("reports drifted when protect-tier file has wrong owner", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toContainEqual({
      kind: "wrong_owner",
      expected: VAULT_OWNERSHIP.user,
      actual: "agent",
    });
  });

  test("reports drifted when protect-tier file has wrong mode", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "644",
    });

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toContainEqual({
      kind: "wrong_mode",
      expected: "444",
      actual: "644",
    });
  });

  test("reports missing protect-tier files", async () => {
    const ops = makeMock();

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const missing = result.value.issues.find((i) => i.status === "missing");
    expect(missing).toBeDefined();
  });

  test("handles literal file paths from config", async () => {
    const ops = makeMock();
    ops.addFile("memory/day1.md", "notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: VAULT_OWNERSHIP.mode,
    });
    ops.addFile("skills/python.md", "skill", {
      owner: "selene",
      group: "staff",
      mode: "644",
    });

    const result = await status(
      opts(
        { version: 1, files: { "memory/day1.md": "protect", "skills/python.md": "watch" } },
        ops,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(0);
  });

  test("missing files are reported", async () => {
    const ops = makeMock();

    const result = await status(opts({ version: 1, files: { "memory/day1.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const missing = result.value.issues.filter((i) => i.status === "missing");
    expect(missing).toHaveLength(1);
  });

  test("reports multiple semantic issues on same file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", { owner: "agent", group: "staff", mode: "777" });

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toHaveLength(3);
    expect(drifted.issues.map((i) => i.kind)).toEqual(["wrong_owner", "wrong_group", "wrong_mode"]);
  });

  test("issues array contains problems from both tiers", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, files: { "SOUL.md": "protect", "notes.md": "watch" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // SOUL.md drifted + notes.md missing
    expect(result.value.issues).toHaveLength(2);
  });

  test("watch-tier files with any ownership report no issues", async () => {
    const ops = makeMock();
    ops.addFile("notes.md", "# Notes", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ version: 1, files: { "notes.md": "watch" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(0);
  });

  test("formatIssue produces readable strings", () => {
    const issues: DriftIssue[] = [
      { kind: "wrong_owner", expected: "soulguardian", actual: "agent" },
      { kind: "wrong_mode", expected: "444", actual: "644" },
    ];
    expect(formatIssue(issues[0]!)).toBe("owner is agent, expected soulguardian");
    expect(formatIssue(issues[1]!)).toBe("mode is 644, expected 444");
  });

  // ── Directory-aware tests ──────────────────────────────────────────

  test("directory with correct ownership reports ok", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ version: 1, files: { "skills/": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(0);
    expect(result.value.files[0]!.status).toBe("ok");
  });

  test("directory with wrong child ownership reports drifted", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(opts({ version: 1, files: { "skills/": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues.length).toBeGreaterThan(0);
  });

  test("directory expects mode 555 not 444", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444", // wrong — should be 555
    });

    const result = await status(opts({ version: 1, files: { "skills/": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const drifted = result.value.issues.find((i) => i.status === "drifted");
    expect(drifted).toBeDefined();
    if (drifted?.status !== "drifted") return;
    expect(drifted.issues).toContainEqual({
      kind: "wrong_mode",
      expected: "555",
      actual: "444",
    });
  });

  // ── Staged change tests ──────────────────────────────────────────

  test("detects staged changes for a file", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "# Updated Soul", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const okFile = result.value.files.find((f) => f.path === "SOUL.md");
    expect(okFile).toBeDefined();
    expect(okFile!.status).toBe("ok");
    if (okFile!.status === "ok") {
      expect(okFile!.stagedChanges).toBe(1);
    }
  });

  test("detects staged changes for a directory", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "555",
    });
    ops.addFile("skills/python.md", "skill", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });
    ops.addDirectory(".soulguard-staging/skills", {
      owner: "agent",
      group: "staff",
      mode: "755",
    });
    ops.addFile(".soulguard-staging/skills/python.md", "updated skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });
    ops.addFile(".soulguard-staging/skills/rust.md", "new skill", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });

    const result = await status(opts({ version: 1, files: { "skills/": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const okFile = result.value.files.find((f) => f.path === "skills/");
    expect(okFile).toBeDefined();
    expect(okFile!.status).toBe("ok");
    if (okFile!.status === "ok") {
      expect(okFile!.stagedChanges).toBe(2);
    }
  });

  test("no staged changes when staging dir is empty", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(opts({ version: 1, files: { "SOUL.md": "protect" } }, ops));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const okFile = result.value.files.find((f) => f.path === "SOUL.md");
    expect(okFile).toBeDefined();
    expect(okFile!.status).toBe("ok");
    if (okFile!.status === "ok") {
      expect(okFile!.stagedChanges).toBeUndefined();
    }
  });

  test("files array includes all statuses", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: VAULT_OWNERSHIP.user,
      group: VAULT_OWNERSHIP.group,
      mode: "444",
    });

    const result = await status(
      opts({ version: 1, files: { "SOUL.md": "protect", "notes.md": "watch" } }, ops),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.files).toHaveLength(2);
    const soulFile = result.value.files.find((f) => f.path === "SOUL.md");
    const notesFile = result.value.files.find((f) => f.path === "notes.md");
    expect(soulFile!.status).toBe("ok");
    expect(notesFile!.status).toBe("missing");
  });
});
