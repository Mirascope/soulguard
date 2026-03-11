/**
 * Staging watcher — polls .soulguard-staging/ for changes and emits
 * proposal events after debounce / batch-ready.
 *
 * Pure filesystem logic. No channel or proposal lifecycle awareness.
 */

import { EventEmitter } from "node:events";
import type { SystemOperations } from "../util/system-ops.js";

// ── Types ──────────────────────────────────────────────────────────────

/** Snapshot of the staging directory at a point in time. */
export type StagingSnapshot = {
  /** Staged files: relative path → content SHA-256 hash. */
  files: Map<string, string>;
  /** Agent-provided description (from .description file). */
  description?: string;
  /** ISO-8601 timestamp when the snapshot was taken. */
  timestamp: string;
};

/** Events emitted by the watcher. */
export type WatcherEvents = {
  /** Staging changes are ready for a new proposal. */
  proposal: [snapshot: StagingSnapshot];
  /** An error occurred while watching. */
  error: [error: Error];
};

export type WatcherOptions = {
  ops: SystemOperations;
  /** Path to the staging directory (e.g. ".soulguard-staging"). */
  stagingDir: string;
  /** Debounce period (ms) after last change before emitting. */
  debounceMs: number;
  /** Max wait (ms) for .wait-for-ready sentinel removal. */
  batchReadyTimeoutMs: number;
  /** Polling interval (ms). Default: 1000. */
  pollIntervalMs?: number;
};

/** Metadata files excluded from the staging snapshot file map. */
const METADATA_FILES = new Set([".wait-for-ready", ".ready", ".description"]);

// ── StagingWatcher ─────────────────────────────────────────────────────

export class StagingWatcher extends EventEmitter<WatcherEvents> {
  private readonly _ops: SystemOperations;
  private readonly _stagingDir: string;
  private readonly _debounceMs: number;
  private readonly _batchReadyTimeoutMs: number;
  private readonly _pollIntervalMs: number;

  private _running = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _batchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Last known state for change detection: path → hash. */
  private _lastKnownState = new Map<string, string>();

  constructor(options: WatcherOptions) {
    super();
    this._ops = options.ops;
    this._stagingDir = options.stagingDir;
    this._debounceMs = options.debounceMs;
    this._batchReadyTimeoutMs = options.batchReadyTimeoutMs;
    this._pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    throw new Error("Not implemented");
  }

  stop(): void {
    throw new Error("Not implemented");
  }
}
