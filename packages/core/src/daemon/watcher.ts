/**
 * Staging watcher — polls .soulguard-staging/ for changes and emits
 * a bare signal when it's time to create a proposal.
 *
 * Pure timing logic. The watcher doesn't build state trees or diffs —
 * it just detects changes, debounces, handles batch mode, and says "go."
 * The proposal manager is responsible for building the actual proposal.
 */

import { EventEmitter } from "node:events";
import type { SystemOperations } from "../util/system-ops.js";

// ── Types ──────────────────────────────────────────────────────────────

/** Events emitted by the watcher. */
export type WatcherEvents = {
  /** Staging changes are ready — proposal manager should build a proposal. */
  proposal: [];
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

/** Metadata files excluded from change detection. */
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

  /** Last known staging directory fingerprint for change detection. */
  private _lastFingerprint: string | null = null;

  /** Whether we're in batch mode (waiting for ready signal). */
  private _inBatchMode = false;

  /** Whether changes are pending emission (debounced). */
  private _changesPending = false;

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
    if (this._running) return;
    this._running = true;
    this._lastFingerprint = null;
    this._inBatchMode = false;
    this._changesPending = false;
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), this._pollIntervalMs);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    this._changesPending = false;
    this._inBatchMode = false;
  }

  private async _poll(): Promise<void> {
    try {
      const fingerprint = await this._computeFingerprint();
      if (fingerprint === null) return;

      const waitForReadyResult = await this._ops.exists(`${this._stagingDir}/.wait-for-ready`);
      const waitForReady = waitForReadyResult.ok && waitForReadyResult.value;

      const readyResult = await this._ops.exists(`${this._stagingDir}/.ready`);
      const ready = readyResult.ok && readyResult.value;

      const changed = fingerprint !== this._lastFingerprint;
      const isEmpty = fingerprint === "";

      if (changed && !isEmpty) {
        this._lastFingerprint = fingerprint;
        this._changesPending = true;

        if (waitForReady && !ready) {
          if (!this._inBatchMode) {
            this._inBatchMode = true;
            this._batchTimer = setTimeout(() => {
              if (this._running && this._changesPending) {
                this._emitProposal();
              }
            }, this._batchReadyTimeoutMs);
          }
          if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
          }
          return;
        }

        this._resetDebounce();
        return;
      }

      // Check if batch mode should end
      if (this._inBatchMode && this._changesPending && (!waitForReady || ready)) {
        this._emitProposal();
      }
    } catch (e) {
      this.emit("error", e instanceof Error ? e : new Error(String(e)));
    }
  }

  private async _computeFingerprint(): Promise<string | null> {
    const listResult = await this._ops.listDir(this._stagingDir);
    if (!listResult.ok) {
      if (listResult.error.kind === "not_found") return "";
      this.emit("error", new Error(`Failed to list staging directory: ${listResult.error.kind}`));
      return null;
    }

    const files = listResult.value;
    const prefix = this._stagingDir + "/";
    const contentFiles = files.filter((f) => {
      const basename = f.startsWith(prefix) ? f.slice(prefix.length) : f;
      return !METADATA_FILES.has(basename);
    });

    if (contentFiles.length === 0) return "";

    const parts: string[] = [];
    for (const file of contentFiles.sort()) {
      const hashResult = await this._ops.hashFile(file);
      if (hashResult.ok) {
        parts.push(`${file}:${hashResult.value}`);
      }
    }
    return parts.join("\n");
  }

  private _resetDebounce(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (this._running && this._changesPending && !this._inBatchMode) {
        this._emitProposal();
      }
    }, this._debounceMs);
  }

  private _emitProposal(): void {
    this._changesPending = false;
    this._inBatchMode = false;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    this.emit("proposal");
  }
}
