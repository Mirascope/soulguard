import { describe, expect, test } from "bun:test";
import { diff } from "./diff.js";
import { MockSystemOps } from "./system-ops-mock.js";
import type { SoulguardConfig } from "./types.js";

const WORKSPACE = "/test/workspace";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(vault: string[] = ["SOUL.md"]): SoulguardConfig {
  return { vault, ledger: [] };
}

describe("diff", () => {
  test("no changes → all unchanged, hasChanges false", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/staging", "");
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard/staging/SOUL.md", "# Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(false);
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.status).toBe("unchanged");
  });

  test("modified file → shows diff, hasChanges true", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/staging", "");
    ops.addFile("SOUL.md", "# Soul\noriginal");
    ops.addFile(".soulguard/staging/SOUL.md", "# Soul\nmodified");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.status).toBe("modified");
    expect(result.value.files[0]!.diff).toContain("-original");
    expect(result.value.files[0]!.diff).toContain("+modified");
  });

  test("staging missing for a vault file → staging_missing status", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/staging", "");
    ops.addFile("SOUL.md", "# Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.status).toBe("staging_missing");
  });

  test("vault file missing → vault_missing status", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/staging", "");
    ops.addFile(".soulguard/staging/SOUL.md", "# New Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasChanges).toBe(true);
    expect(result.value.files[0]!.status).toBe("vault_missing");
  });

  test("no staging dir → no_staging error", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const result = await diff({ ops, config: makeConfig() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_staging");
  });

  test("specific files filter works", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/staging", "");
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard/staging/SOUL.md", "# Soul");
    ops.addFile("AGENTS.md", "# Agents");
    ops.addFile(".soulguard/staging/AGENTS.md", "# Agents modified");

    const config = makeConfig(["SOUL.md", "AGENTS.md"]);
    const result = await diff({ ops, config, files: ["SOUL.md"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.path).toBe("SOUL.md");
  });

  test("globs are skipped", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard/staging", "");
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard/staging/SOUL.md", "# Soul");

    const config = makeConfig(["SOUL.md", "memory/**"]);
    const result = await diff({ ops, config });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toHaveLength(1);
    expect(result.value.files[0]!.path).toBe("SOUL.md");
  });
});
