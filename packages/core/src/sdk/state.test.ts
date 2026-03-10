import { describe, expect, test } from "bun:test";
import { StateTree } from "./state.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import type { SoulguardConfig, Tier } from "../util/types.js";
import { DELETE_SENTINEL } from "./staging.js";

const WORKSPACE = "/test/workspace";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(files: Record<string, Tier>): SoulguardConfig {
  return { version: 1, files };
}

async function build(ops: MockSystemOps, config: SoulguardConfig) {
  const result = await StateTree.build({ ops, config });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("build failed");
  return result.value;
}

// ── Protect file scenarios ──────────────────────────────────────────────

describe("protect file: exists on disk, no staging", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "canonicalHash": "cc416e4eab37ce0fbc437ee72fbe2cad31a99d0413ee64bd555ff7220714b423",
          "configTier": "protect",
          "kind": "file",
          "ownership": {
            "group": "soulguard",
            "mode": "444",
            "user": "soulguardian",
          },
          "path": "SOUL.md",
          "stagedHash": null,
          "status": "unchanged",
        },
      ]
    `);
  });

  test("flatFiles", async () => {
    const tree = await setup();
    expect(tree.flatFiles().map((f) => f.path)).toMatchInlineSnapshot(`
      [
        "SOUL.md",
      ]
    `);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeNull();
  });

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

describe("protect file: exists on disk + different staged copy", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "modified");
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "canonicalHash": "0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5",
          "configTier": "protect",
          "kind": "file",
          "ownership": {
            "group": "soulguard",
            "mode": "444",
            "user": "soulguardian",
          },
          "path": "SOUL.md",
          "stagedHash": "b80012851cf027c6d8adda328907d400c95773958fb4fec3e544a02cd5eeab0e",
          "status": "modified",
        },
      ]
    `);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles().map((f) => f.path)).toMatchInlineSnapshot(`
      [
        "SOUL.md",
      ]
    `);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

describe("protect file: exists on disk + identical staged copy", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "same content", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "same content");
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("hashes match, status unchanged", async () => {
    const tree = await setup();
    const file = tree.entities[0]!;
    expect(file.kind).toBe("file");
    if (file.kind !== "file") return;
    expect(file.canonicalHash).toBe(file.stagedHash);
    expect(file.status).toBe("unchanged");
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeNull();
  });
});

describe("protect file: doesn't exist on disk, no staging", () => {
  const setup = async () => {
    const ops = makeMock();
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("entities — no ghost entity", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`[]`);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

describe("protect file: doesn't exist on disk + staged copy (new file)", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile(".soulguard-staging/SOUL.md", "new content");
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "canonicalHash": null,
          "configTier": "protect",
          "kind": "file",
          "ownership": null,
          "path": "SOUL.md",
          "stagedHash": "fe32608c9ef5b6cf7e3f946480253ff76f24f4ec0678f3d0f07f9844cbff9601",
          "status": "created",
        },
      ]
    `);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles().map((f) => f.path)).toMatchInlineSnapshot(`
      [
        "SOUL.md",
      ]
    `);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });
});

describe("protect file: delete sentinel in staging", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", JSON.stringify(DELETE_SENTINEL));
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "canonicalHash": "cc416e4eab37ce0fbc437ee72fbe2cad31a99d0413ee64bd555ff7220714b423",
          "configTier": "protect",
          "kind": "file",
          "ownership": {
            "group": "soulguard",
            "mode": "444",
            "user": "soulguardian",
          },
          "path": "SOUL.md",
          "stagedHash": null,
          "status": "deleted",
        },
      ]
    `);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    const changed = tree.changedFiles();
    expect(changed).toHaveLength(1);
    expect(changed[0]!.status).toBe("deleted");
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });
});

// ── Watch file scenarios ────────────────────────────────────────────────

describe("watch file: exists on disk", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("MEMORY.md", "# Memory", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });
    return build(ops, makeConfig({ "MEMORY.md": "watch" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "canonicalHash": "74052e9ac3c219f02479a4a0e9324b9abf643c7e510e10e8830e4031885eff24",
          "configTier": "watch",
          "kind": "file",
          "ownership": {
            "group": "staff",
            "mode": "644",
            "user": "agent",
          },
          "path": "MEMORY.md",
          "stagedHash": null,
          "status": "unchanged",
        },
      ]
    `);
  });

  test("driftedEntities — watch never drifts", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

// ── Protect directory scenarios ─────────────────────────────────────────

describe("protect directory: children listed with hashes", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/search.md", "# Search", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "canonicalHash": "4cc4b9442bff697f6f3ed607f11143e0e168b8e246bdf1b51992cdf7e1ed6c39",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/search.md",
              "stagedHash": null,
              "status": "unchanged",
            },
            {
              "canonicalHash": "828b23d4af9524129ec75226e2863d0fab8dd7474d698d667020f4a7796992ae",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/tool.md",
              "stagedHash": null,
              "status": "unchanged",
            },
          ],
          "configTier": "protect",
          "deleted": false,
          "kind": "directory",
          "ownership": {
            "group": "soulguard",
            "mode": "555",
            "user": "soulguardian",
          },
          "path": "skills",
        },
      ]
    `);
  });

  test("flatFiles", async () => {
    const tree = await setup();
    expect(
      tree
        .flatFiles()
        .map((f) => f.path)
        .sort(),
    ).toMatchInlineSnapshot(`
      [
        "skills/search.md",
        "skills/tool.md",
      ]
    `);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

describe("protect directory: child with staged modification", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "original", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("skills/unchanged.md", "same", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addDirectory(".soulguard-staging/skills");
    ops.addFile(".soulguard-staging/skills/tool.md", "modified");
    ops.addFile(".soulguard-staging/skills/unchanged.md", "same");
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "canonicalHash": "0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/tool.md",
              "stagedHash": "b80012851cf027c6d8adda328907d400c95773958fb4fec3e544a02cd5eeab0e",
              "status": "modified",
            },
            {
              "canonicalHash": "0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/unchanged.md",
              "stagedHash": "0967115f2813a3541eaef77de9d9d5773f1c0c04314b0bbfe4ff3b3b1c55b5d5",
              "status": "unchanged",
            },
          ],
          "configTier": "protect",
          "deleted": false,
          "kind": "directory",
          "ownership": {
            "group": "soulguard",
            "mode": "555",
            "user": "soulguardian",
          },
          "path": "skills",
        },
      ]
    `);
  });

  test("changedFiles — only modified child", async () => {
    const tree = await setup();
    expect(tree.changedFiles().map((f) => f.path)).toMatchInlineSnapshot(`
      [
        "skills/tool.md",
      ]
    `);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });
});

describe("protect directory: new file staged in existing dir", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // new file only in staging, doesn't exist on disk
    ops.addDirectory(".soulguard-staging/skills");
    ops.addFile(".soulguard-staging/skills/tool.md", "# Tool");
    ops.addFile(".soulguard-staging/skills/new.md", "new notes");
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("entities — new child appears with null ownership/canonicalHash", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "canonicalHash": null,
              "configTier": "protect",
              "kind": "file",
              "ownership": null,
              "path": "skills/new.md",
              "stagedHash": "dd843daec16b78c754e78d4fbf9324654efef0322c3c74bf373df1f898799f7f",
              "status": "created",
            },
            {
              "canonicalHash": "828b23d4af9524129ec75226e2863d0fab8dd7474d698d667020f4a7796992ae",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/tool.md",
              "stagedHash": "828b23d4af9524129ec75226e2863d0fab8dd7474d698d667020f4a7796992ae",
              "status": "unchanged",
            },
          ],
          "configTier": "protect",
          "deleted": false,
          "kind": "directory",
          "ownership": {
            "group": "soulguard",
            "mode": "555",
            "user": "soulguardian",
          },
          "path": "skills",
        },
      ]
    `);
  });

  test("changedFiles — only new file", async () => {
    const tree = await setup();
    expect(tree.changedFiles().map((f) => f.path)).toMatchInlineSnapshot(`
      [
        "skills/new.md",
      ]
    `);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });
});

describe("protect directory: delete sentinel on directory", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("skills/search.md", "# Search", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    // Staging path is a file with delete sentinel (not a directory)
    ops.addFile(".soulguard-staging/skills", JSON.stringify(DELETE_SENTINEL));
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("entities — all children have status deleted", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "canonicalHash": "4cc4b9442bff697f6f3ed607f11143e0e168b8e246bdf1b51992cdf7e1ed6c39",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/search.md",
              "stagedHash": null,
              "status": "deleted",
            },
            {
              "canonicalHash": "828b23d4af9524129ec75226e2863d0fab8dd7474d698d667020f4a7796992ae",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/tool.md",
              "stagedHash": null,
              "status": "deleted",
            },
          ],
          "configTier": "protect",
          "deleted": true,
          "kind": "directory",
          "ownership": {
            "group": "soulguard",
            "mode": "555",
            "user": "soulguardian",
          },
          "path": "skills",
        },
      ]
    `);
  });

  test("changedFiles — all children returned", async () => {
    const tree = await setup();
    expect(
      tree
        .changedFiles()
        .map((f) => f.path)
        .sort(),
    ).toMatchInlineSnapshot(`
      [
        "skills/search.md",
        "skills/tool.md",
      ]
    `);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });
});

describe("protect directory: delete sentinel with nested subdirectory", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addDirectory("skills/advanced", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("skills/advanced/search.md", "# Search", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/skills", JSON.stringify(DELETE_SENTINEL));
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("nested files are flattened — no StateDirectory for subdirectory", async () => {
    const tree = await setup();
    const dir = tree.entities[0]!;
    expect(dir.kind).toBe("directory");
    if (dir.kind !== "directory") return;
    expect(dir.deleted).toBe(true);
    // All children are flat files, including ones from the subdirectory.
    // listDir returns flat file paths, so subdirectories are not represented
    // as StateDirectory nodes.
    expect(dir.children.every((c) => c.kind === "file")).toBe(true);
    expect(dir.children.map((c) => c.path).sort()).toMatchInlineSnapshot(`
      [
        "skills/advanced/search.md",
        "skills/tool.md",
      ]
    `);
  });

  test("all nested files have status deleted", async () => {
    const tree = await setup();
    const files = tree.flatFiles();
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(file.status).toBe("deleted");
    }
  });

  test("changedFiles includes nested files", async () => {
    const tree = await setup();
    expect(
      tree
        .changedFiles()
        .map((f) => f.path)
        .sort(),
    ).toMatchInlineSnapshot(`
      [
        "skills/advanced/search.md",
        "skills/tool.md",
      ]
    `);
  });
});

describe("protect directory: doesn't exist on disk, no staging", () => {
  const setup = async () => {
    const ops = makeMock();
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("entities — no ghost entity", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`[]`);
  });

  test("flatFiles", async () => {
    const tree = await setup();
    expect(tree.flatFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

// ── Drift scenarios ─────────────────────────────────────────────────────

describe("protect file: ownership drift (wrong owner)", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: "soulguard",
      mode: "444",
    });
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`
      [
        {
          "details": [
            {
              "actual": "agent",
              "expected": "soulguardian",
              "kind": "wrong_owner",
            },
          ],
          "entity": {
            "canonicalHash": "cc416e4eab37ce0fbc437ee72fbe2cad31a99d0413ee64bd555ff7220714b423",
            "configTier": "protect",
            "kind": "file",
            "ownership": {
              "group": "soulguard",
              "mode": "444",
              "user": "agent",
            },
            "path": "SOUL.md",
            "stagedHash": null,
            "status": "unchanged",
          },
        },
      ]
    `);
  });
});

describe("protect file: all three fields drifted", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });
    return build(ops, makeConfig({ "SOUL.md": "protect" }));
  };

  test("driftedEntities", async () => {
    const tree = await setup();
    const drifted = tree.driftedEntities();
    expect(drifted).toHaveLength(1);
    expect(drifted[0]!.details).toMatchInlineSnapshot(`
      [
        {
          "actual": "agent",
          "expected": "soulguardian",
          "kind": "wrong_owner",
        },
        {
          "actual": "staff",
          "expected": "soulguard",
          "kind": "wrong_group",
        },
        {
          "actual": "644",
          "expected": "444",
          "kind": "wrong_mode",
        },
      ]
    `);
  });
});

describe("protect directory: drift on dir and child independently", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "755", // wrong — should be 555
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "agent", // wrong — should be soulguardian
      group: "staff",
      mode: "644",
    });
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("driftedEntities — both dir and child reported", async () => {
    const tree = await setup();
    const drifted = tree.driftedEntities();
    const dirDrift = drifted.find((d) => d.entity.path === "skills");
    const childDrift = drifted.find((d) => d.entity.path === "skills/tool.md");

    expect(dirDrift).toBeDefined();
    expect(dirDrift!.details).toMatchInlineSnapshot(`
      [
        {
          "actual": "755",
          "expected": "555",
          "kind": "wrong_mode",
        },
      ]
    `);

    expect(childDrift).toBeDefined();
    expect(childDrift!.details).toHaveLength(3);
  });
});

// ── Mixed scenarios ─────────────────────────────────────────────────────

describe("multiple config entries: files and directories", () => {
  const setup = async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile("MEMORY.md", "# Memory", {
      owner: "agent",
      group: "staff",
      mode: "644",
    });
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    return build(
      ops,
      makeConfig({
        "SOUL.md": "protect",
        "MEMORY.md": "watch",
        "skills/": "protect",
      }),
    );
  };

  test("entities", async () => {
    const tree = await setup();
    expect(tree.entities).toMatchInlineSnapshot(`
      [
        {
          "canonicalHash": "cc416e4eab37ce0fbc437ee72fbe2cad31a99d0413ee64bd555ff7220714b423",
          "configTier": "protect",
          "kind": "file",
          "ownership": {
            "group": "soulguard",
            "mode": "444",
            "user": "soulguardian",
          },
          "path": "SOUL.md",
          "stagedHash": null,
          "status": "unchanged",
        },
        {
          "canonicalHash": "74052e9ac3c219f02479a4a0e9324b9abf643c7e510e10e8830e4031885eff24",
          "configTier": "watch",
          "kind": "file",
          "ownership": {
            "group": "staff",
            "mode": "644",
            "user": "agent",
          },
          "path": "MEMORY.md",
          "stagedHash": null,
          "status": "unchanged",
        },
        {
          "children": [
            {
              "canonicalHash": "828b23d4af9524129ec75226e2863d0fab8dd7474d698d667020f4a7796992ae",
              "configTier": "protect",
              "kind": "file",
              "ownership": {
                "group": "soulguard",
                "mode": "444",
                "user": "soulguardian",
              },
              "path": "skills/tool.md",
              "stagedHash": null,
              "status": "unchanged",
            },
          ],
          "configTier": "protect",
          "deleted": false,
          "kind": "directory",
          "ownership": {
            "group": "soulguard",
            "mode": "555",
            "user": "soulguardian",
          },
          "path": "skills",
        },
      ]
    `);
  });

  test("flatFiles", async () => {
    const tree = await setup();
    expect(
      tree
        .flatFiles()
        .map((f) => f.path)
        .sort(),
    ).toMatchInlineSnapshot(`
      [
        "MEMORY.md",
        "SOUL.md",
        "skills/tool.md",
      ]
    `);
  });

  test("changedFiles", async () => {
    const tree = await setup();
    expect(tree.changedFiles()).toMatchInlineSnapshot(`[]`);
  });

  test("driftedEntities", async () => {
    const tree = await setup();
    expect(tree.driftedEntities()).toMatchInlineSnapshot(`[]`);
  });
});

// ── Approval hash properties ────────────────────────────────────────────

// ── Staged-only directory (no disk) ─────────────────────────────────────

describe("protect directory: doesn't exist on disk + staged children (new dir)", () => {
  const setup = async () => {
    const ops = makeMock();
    // Directory only exists in staging, not on disk
    ops.addDirectory(".soulguard-staging/skills");
    ops.addFile(".soulguard-staging/skills/search.md", "# Search");
    ops.addFile(".soulguard-staging/skills/tool.md", "# Tool");
    return build(ops, makeConfig({ "skills/": "protect" }));
  };

  test("entities — directory with created children, null ownership", async () => {
    const tree = await setup();
    const dir = tree.entities[0]!;
    expect(dir.kind).toBe("directory");
    if (dir.kind !== "directory") return;
    expect(dir.ownership).toBeNull();
    expect(dir.deleted).toBe(false);
    expect(dir.children).toHaveLength(2);
    for (const child of dir.children) {
      expect(child.kind).toBe("file");
      if (child.kind !== "file") continue;
      expect(child.status).toBe("created");
      expect(child.canonicalHash).toBeNull();
      expect(child.ownership).toBeNull();
      expect(child.stagedHash).toBeDefined();
    }
  });

  test("changedFiles — both children returned", async () => {
    const tree = await setup();
    expect(
      tree
        .changedFiles()
        .map((f) => f.path)
        .sort(),
    ).toMatchInlineSnapshot(`
      [
        "skills/search.md",
        "skills/tool.md",
      ]
    `);
  });

  test("approvalHash", async () => {
    const tree = await setup();
    expect(tree.approvalHash).toBeDefined();
    expect(tree.approvalHash!.length).toBe(64);
  });
});

// ── Approval hash properties ────────────────────────────────────────────

describe("approvalHash properties", () => {
  test("deterministic — same state → same hash", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "modified");

    const config = makeConfig({ "SOUL.md": "protect" });
    const tree1 = await build(ops, config);
    const tree2 = await build(ops, config);
    expect(tree1.approvalHash).toBe(tree2.approvalHash);
  });

  test("different staged content → different hash", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "original", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });

    const config = makeConfig({ "SOUL.md": "protect" });

    ops.addFile(".soulguard-staging/SOUL.md", "modified-v1");
    const tree1 = await build(ops, config);

    ops.addFile(".soulguard-staging/SOUL.md", "modified-v2");
    const tree2 = await build(ops, config);

    expect(tree1.approvalHash).not.toBe(tree2.approvalHash);
  });
});

// ── Error propagation ───────────────────────────────────────────────────

describe("error propagation: file stat failure (not not_found)", () => {
  test("permission_denied on stat propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.failingStats.add("SOUL.md");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "SOUL.md": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("SOUL.md");
      expect(result.error.message).toContain("permission_denied");
    }
  });
});

describe("error propagation: hash failure on existing file", () => {
  test("hash failure propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.failingHashes.add("SOUL.md");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "SOUL.md": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("hash failed");
      expect(result.error.message).toContain("SOUL.md");
    }
  });
});

describe("error propagation: hash failure on staged file", () => {
  test("staged hash failure propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addFile(".soulguard-staging/SOUL.md", "new content");
    ops.failingHashes.add(".soulguard-staging/SOUL.md");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "SOUL.md": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("hash failed");
      expect(result.error.message).toContain(".soulguard-staging/SOUL.md");
    }
  });
});

describe("error propagation: read failure on staging (delete sentinel check)", () => {
  test("read failure propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addFile(".soulguard-staging/SOUL.md", "some content");
    ops.failingReads.add(".soulguard-staging/SOUL.md");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "SOUL.md": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("read failed");
    }
  });
});

describe("error propagation: directory listDir failure", () => {
  test("listDir failure on canonical dir propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.failingListDirs.add("skills");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "skills/": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("listDir failed");
      expect(result.error.message).toContain("skills");
    }
  });
});

describe("error propagation: directory stat failure (not not_found)", () => {
  test("permission_denied on directory stat propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.failingStats.add("skills");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "skills/": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("skills");
      expect(result.error.message).toContain("permission_denied");
    }
  });
});

describe("error propagation: child hash failure in directory", () => {
  test("hash failure on child propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.failingHashes.add("skills/tool.md");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "skills/": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("hash failed");
      expect(result.error.message).toContain("skills/tool.md");
    }
  });
});

describe("error propagation: listDir failure on staging dir", () => {
  test("staging listDir failure propagates as build_failed", async () => {
    const ops = makeMock();
    ops.addDirectory("skills", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "555",
    });
    ops.addFile("skills/tool.md", "# Tool", {
      owner: "soulguardian",
      group: "soulguard",
      mode: "444",
    });
    ops.addDirectory(".soulguard-staging/skills");
    ops.addFile(".soulguard-staging/skills/tool.md", "modified");
    ops.failingListDirs.add(".soulguard-staging/skills");

    const result = await StateTree.build({
      ops,
      config: makeConfig({ "skills/": "protect" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("build_failed");
      expect(result.error.message).toContain("listDir failed");
      expect(result.error.message).toContain(".soulguard-staging/skills");
    }
  });
});
