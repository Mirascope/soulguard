/**
 * SoulguardDaemon integration tests.
 *
 * Tests the full wiring: watcher → proposal manager → channel.
 */

import { describe, test } from "bun:test";
import { SoulguardDaemon } from "./daemon.js";

describe("SoulguardDaemon", () => {
  // ── Startup ────────────────────────────────────────────────────────

  test.skip("start loads channel plugin and starts watcher", () => {
    // Mock dynamic import to return a mock channel
    // Expect: watcher.running === true, channel created
  });

  test.skip("start fails with clear error when daemon config is missing", () => {
    // Config has no daemon key
    // Expect: descriptive error
  });

  test.skip("start fails with helpful message when channel package not found", () => {
    // daemon.channel = "nonexistent"
    // Expect: "install @soulguard/nonexistent to use the nonexistent channel"
  });

  // ── Event wiring ───────────────────────────────────────────────────

  test.skip("watcher proposal event triggers proposal manager", () => {
    // Watcher emits "proposal" → proposalManager.onStagingReady() called
  });

  test.skip("watcher error event is logged", () => {
    // Watcher emits "error" → daemon handles gracefully
  });

  // ── Shutdown ───────────────────────────────────────────────────────

  test.skip("stop disposes channel, stops watcher, and disposes proposal manager", () => {
    // All components cleaned up
    // running === false
  });

  test.skip("stop is safe to call when not running", () => {
    // No-op, no errors
  });

  // ── Defaults ───────────────────────────────────────────────────────

  test.skip("uses DEFAULT_DEBOUNCE_MS when debounceMs not in config", () => {});

  test.skip("uses DEFAULT_BATCH_READY_TIMEOUT_MS when batchReadyTimeoutMs not in config", () => {});
});
