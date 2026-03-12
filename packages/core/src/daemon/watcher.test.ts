/**
 * StagingWatcher tests.
 *
 * Uses MockSystemOps to simulate filesystem state without touching disk.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { StagingWatcher } from "./watcher.js";
import { MockSystemOps } from "../util/system-ops-mock.js";

const STAGING = ".soulguard-staging";

function makeWatcher(
  ops: MockSystemOps,
  overrides: Partial<{
    debounceMs: number;
    batchReadyTimeoutMs: number;
    pollIntervalMs: number;
  }> = {},
) {
  return new StagingWatcher({
    ops,
    stagingDir: STAGING,
    debounceMs: overrides.debounceMs ?? 30,
    batchReadyTimeoutMs: overrides.batchReadyTimeoutMs ?? 500,
    pollIntervalMs: overrides.pollIntervalMs ?? 15,
  });
}

function makeMock(): MockSystemOps {
  const ops = new MockSystemOps("/fake");
  ops.addDirectory(STAGING);
  return ops;
}

function waitForEvent(
  watcher: StagingWatcher,
  event: "proposal" | "error",
  timeoutMs = 500,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    watcher.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function noEvent(watcher: StagingWatcher, event: "proposal" | "error", ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      watcher.removeListener(event, handler);
      resolve();
    }, ms);
    const handler = () => {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${event} event`));
    };
    watcher.once(event, handler);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let watcher: StagingWatcher | null = null;

afterEach(() => {
  watcher?.stop();
  watcher = null;
});

describe("StagingWatcher", () => {
  // ── Debounce ───────────────────────────────────────────────────────

  test("emits proposal after debounce period with no further changes", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops);
    const p = waitForEvent(watcher, "proposal");
    watcher.start();
    await p;
  });

  test("resets debounce timer on subsequent changes", async () => {
    const ops = makeMock();
    watcher = makeWatcher(ops, { debounceMs: 60, pollIntervalMs: 15 });

    let count = 0;
    watcher.on("proposal", () => count++);
    ops.addFile(`${STAGING}/a.txt`, "a");
    watcher.start();

    await sleep(30);
    // Modify file mid-debounce
    ops.addFile(`${STAGING}/b.txt`, "b");
    await sleep(100);
    expect(count).toBe(1);
  });

  test("rapid writes produce single emission", async () => {
    const ops = makeMock();
    watcher = makeWatcher(ops, { debounceMs: 50, pollIntervalMs: 10 });
    let count = 0;
    watcher.on("proposal", () => count++);
    watcher.start();

    for (let i = 0; i < 10; i++) {
      ops.addFile(`${STAGING}/file${i}.txt`, `content${i}`);
      await sleep(5);
    }
    await sleep(120);
    expect(count).toBe(1);
  });

  // ── Batch mode ─────────────────────────────────────────────────────

  test("suppresses emission while .wait-for-ready sentinel exists", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/.wait-for-ready`, "");
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await noEvent(watcher, "proposal", 100);
  });

  test("emits when .wait-for-ready is removed", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/.wait-for-ready`, "");
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await sleep(80);
    // Remove sentinel
    await ops.deleteFile(`${STAGING}/.wait-for-ready`);
    await waitForEvent(watcher, "proposal");
  });

  test("emits when .ready appears", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/.wait-for-ready`, "");
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await sleep(80);
    ops.addFile(`${STAGING}/.ready`, "");
    await waitForEvent(watcher, "proposal");
  });

  test("batch safety timeout emits after batchReadyTimeoutMs", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/.wait-for-ready`, "");
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, {
      debounceMs: 20,
      pollIntervalMs: 15,
      batchReadyTimeoutMs: 100,
    });
    const p = waitForEvent(watcher, "proposal", 300);
    watcher.start();
    await p;
  });

  // ── Change detection ───────────────────────────────────────────────

  test("does not emit when no files have changed since last emission", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await waitForEvent(watcher, "proposal");
    // No changes — should not emit again
    await noEvent(watcher, "proposal", 100);
  });

  test("emits when file content changes", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await waitForEvent(watcher, "proposal");
    ops.addFile(`${STAGING}/foo.txt`, "world");
    await waitForEvent(watcher, "proposal");
  });

  test("emits when file is added", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await waitForEvent(watcher, "proposal");
    ops.addFile(`${STAGING}/bar.txt`, "new");
    await waitForEvent(watcher, "proposal");
  });

  test("emits when file is removed", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    ops.addFile(`${STAGING}/bar.txt`, "world");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await waitForEvent(watcher, "proposal");
    await ops.deleteFile(`${STAGING}/bar.txt`);
    await waitForEvent(watcher, "proposal");
  });

  // ── Empty staging ──────────────────────────────────────────────────

  test("does not emit when staging directory is empty", async () => {
    const ops = makeMock();
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await noEvent(watcher, "proposal", 100);
  });

  test("does not emit when staging has only metadata files", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/.wait-for-ready`, "");
    ops.addFile(`${STAGING}/.description`, "some desc");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await noEvent(watcher, "proposal", 100);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────

  test("start begins polling", () => {
    const ops = makeMock();
    watcher = makeWatcher(ops);
    expect(watcher.running).toBe(false);
    watcher.start();
    expect(watcher.running).toBe(true);
  });

  test("stop clears all timers", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 200, pollIntervalMs: 15 });
    watcher.start();
    await sleep(30);
    watcher.stop();
    expect(watcher.running).toBe(false);
    let emitted = false;
    watcher.on("proposal", () => {
      emitted = true;
    });
    await sleep(250);
    expect(emitted).toBe(false);
  });

  test("can be restarted after stop", async () => {
    const ops = makeMock();
    ops.addFile(`${STAGING}/foo.txt`, "hello");
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    watcher.start();
    await waitForEvent(watcher, "proposal");
    watcher.stop();
    // Restart — should re-detect files since fingerprint resets
    const p = waitForEvent(watcher, "proposal");
    watcher.start();
    await p;
  });

  // ── Error handling ─────────────────────────────────────────────────

  test("emits error event on permission denied", async () => {
    const ops = makeMock();
    ops.failingListDirs.add(STAGING);
    watcher = makeWatcher(ops, { debounceMs: 20, pollIntervalMs: 15 });
    const p = new Promise<Error>((resolve) => {
      watcher!.once("error", resolve);
    });
    watcher.start();
    const error = await p;
    expect(error.message).toContain("permission_denied");
    expect(watcher.running).toBe(true);
  });
});
