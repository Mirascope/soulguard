/**
 * SoulguardDaemon integration tests.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SoulguardDaemon } from "./daemon.js";
import { registerChannel } from "./channel-registry.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel } from "./types.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import type { SyncResult } from "../sdk/sync.js";

function createMockChannel(): ApprovalChannel {
  return {
    name: "mock",
    postProposal: mock(() => Promise.resolve({ channel: "mock", proposalId: "p1" })),
    waitForApproval: mock(() =>
      Promise.resolve({ approved: true, channel: "mock", approver: "u1" }),
    ),
    postResult: mock(() => Promise.resolve({ ok: true })),
    dispose: mock(() => Promise.resolve()),
  };
}

function createMockOps(): any {
  return {
    readFile: mock(() => Promise.resolve({ ok: true, value: "" } as const)),
    writeFile: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    exists: mock(() => Promise.resolve({ ok: true, value: false } as const)),
    listDir: mock(() => Promise.resolve({ ok: true, value: [] as string[] } as const)),
    hashFile: mock(() => Promise.resolve({ ok: true, value: "abc123" } as const)),
    mkdir: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    remove: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    rename: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    stat: mock(() =>
      Promise.resolve({
        ok: true,
        value: { uid: 1000, gid: 1000, mode: 0o644, isDirectory: false },
      } as const),
    ),
    chown: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    chmod: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    exec: mock(() => Promise.resolve({ ok: true, value: { stdout: "", stderr: "" } } as const)),
  };
}

function baseConfig(overrides?: Partial<SoulguardConfig>): SoulguardConfig {
  return {
    version: 1,
    guardian: "soulguardian_test",
    files: { "SOUL.md": "protect" },
    daemon: { channel: "mock" },
    ...overrides,
  };
}

/** Create a MockSystemOps with files that satisfy StateTree.build for a config. */
function createSyncOps(config: SoulguardConfig): MockSystemOps {
  const ops = new MockSystemOps("/workspace");
  // Add soulguard.json (always implicitly tracked)
  ops.addFile("soulguard.json", JSON.stringify(config), {
    owner: config.guardian,
    group: "soulguard",
    mode: "444",
  });
  // Add files from config so StateTree.build succeeds
  for (const [path, tier] of Object.entries(config.files)) {
    if (path === "soulguard.json") continue;
    if (path.endsWith("/")) {
      ops.addDirectory(path.slice(0, -1), {
        owner: tier === "protect" ? config.guardian : "agent",
        group: tier === "protect" ? "soulguard" : "staff",
        mode: tier === "protect" ? "555" : "755",
      });
    } else {
      ops.addFile(path, `# ${path}`, {
        owner: tier === "protect" ? config.guardian : "agent",
        group: tier === "protect" ? "soulguard" : "staff",
        mode: tier === "protect" ? "444" : "644",
      });
    }
  }
  return ops;
}

let mockChannel: ApprovalChannel;

describe("SoulguardDaemon", () => {
  beforeEach(() => {
    mockChannel = createMockChannel();
    registerChannel("mock", () => mockChannel);
  });

  test("start loads channel plugin and starts proposal manager", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
    });
    await daemon.start();
    expect(daemon.running).toBe(true);
    const pm = (daemon as any)._proposalManager;
    expect(pm).toBeTruthy();
    expect(pm.running).toBe(true);
    await daemon.stop();
  });

  test("start fails with clear error when daemon config is missing", async () => {
    const config = baseConfig();
    delete (config as Record<string, unknown>).daemon;
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config,
    });
    expect(daemon.start()).rejects.toThrow("Daemon configuration missing");
  });

  test("start fails with helpful message when channel not registered", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig({ daemon: { channel: "nonexistent" } }),
    });
    expect(daemon.start()).rejects.toThrow('No channel registered for "nonexistent"');
  });

  test("stop disposes channel and proposal manager", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
    });
    await daemon.start();
    expect(daemon.running).toBe(true);
    await daemon.stop();
    expect(daemon.running).toBe(false);
    expect(mockChannel.dispose).toHaveBeenCalled();
  });

  test("stop is safe to call when not running", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
    });
    await daemon.stop();
    expect(daemon.running).toBe(false);
  });
});

// ── Sync loop tests ─────────────────────────────────────────────────

describe("SoulguardDaemon sync", () => {
  beforeEach(() => {
    mockChannel = createMockChannel();
    registerChannel("mock", () => mockChannel);
  });

  test("sync runs on start and emits synced event", async () => {
    const config = baseConfig({ daemon: { channel: "mock" } });
    const ops = createSyncOps(config);

    const daemon = new SoulguardDaemon({ ops, config });

    const synced = new Promise<SyncResult>((resolve) => {
      daemon.on("synced", resolve);
    });

    await daemon.start();
    const result = await synced;

    expect(result).toBeDefined();
    expect(result.drifts).toBeArray();
    expect(result.errors).toEqual([]);

    await daemon.stop();
  });

  test("daemon works without channel (sync-only mode)", async () => {
    const config = baseConfig({ daemon: {} });
    const ops = createSyncOps(config);

    const daemon = new SoulguardDaemon({ ops, config });

    const synced = new Promise<SyncResult>((resolve) => {
      daemon.on("synced", resolve);
    });

    await daemon.start();
    expect(daemon.running).toBe(true);
    expect(daemon.proposalManager).toBeNull();

    const result = await synced;
    expect(result).toBeDefined();

    await daemon.stop();
  });

  test("sync errors emit sync:error, don't crash", async () => {
    const config = baseConfig({ daemon: {} });
    // Use ops where stat fails — StateTree.build will fail
    const ops = createSyncOps(config);
    ops.failingStats.add("SOUL.md");

    const daemon = new SoulguardDaemon({ ops, config });

    const errorPromise = new Promise<Error>((resolve) => {
      daemon.on("sync:error", resolve);
    });

    await daemon.start();
    const error = await errorPromise;
    expect(error.message).toContain("StateTree.build failed");
    expect(daemon.running).toBe(true); // daemon keeps running

    await daemon.stop();
  });

  test("syncIntervalSecs: 0 disables sync loop", async () => {
    const config = baseConfig({ daemon: { syncIntervalSecs: 0 } });
    const ops = createSyncOps(config);

    const daemon = new SoulguardDaemon({ ops, config });

    let syncFired = false;
    daemon.on("synced", () => {
      syncFired = true;
    });

    await daemon.start();
    expect(daemon.running).toBe(true);
    expect((daemon as any)._syncTimer).toBeNull();

    // Give it a tick to confirm sync never fires
    await new Promise((r) => setTimeout(r, 50));
    expect(syncFired).toBe(false);

    await daemon.stop();
  });

  test("stop clears sync timer", async () => {
    const config = baseConfig({ daemon: {} });
    const ops = createSyncOps(config);

    const daemon = new SoulguardDaemon({ ops, config });

    await daemon.start();
    expect((daemon as any)._syncTimer).not.toBeNull();

    await daemon.stop();
    expect((daemon as any)._syncTimer).toBeNull();
  });

  test("forwards proposal events from ProposalManager", async () => {
    const config: SoulguardConfig = {
      version: 1,
      guardian: "soulguardian_test",
      files: { "SOUL.md": "protect" },
      daemon: { channel: "mock" },
    };
    const ops = createSyncOps(config);
    // Stage a change so PM detects it and posts a proposal
    ops.addFile(".soulguard-staging/SOUL.md", "modified content");

    const daemon = new SoulguardDaemon({ ops, config });

    const proposed = new Promise<void>((resolve) => {
      daemon.on("proposed", () => resolve());
    });

    await daemon.start();

    // Wait for the proposal event (PM polls every 2s by default, but fires immediately)
    await Promise.race([
      proposed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);

    await daemon.stop();
  });
});
