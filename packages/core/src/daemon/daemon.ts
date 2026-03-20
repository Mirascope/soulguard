/**
 * SoulguardDaemon — top-level orchestrator.
 *
 * Runs two independent loops:
 *   1. Sync loop (always) — periodic drift-fix + git commit
 *   2. Proposal loop (when a channel is configured) — staging → approval → apply
 *
 * All events (sync + proposal) are emitted on the daemon itself,
 * so consumers only need to listen on one object.
 */

import { EventEmitter } from "node:events";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel, Proposal } from "./types.js";
import { getChannel } from "./channel-registry.js";
import { ProposalManager } from "./proposal-manager.js";
import { StateTree } from "../sdk/state.js";
import { sync } from "../sdk/sync.js";
import type { SyncResult } from "../sdk/sync.js";

// ── Types ──────────────────────────────────────────────────────────────

export type DaemonOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Override the channel from config (used by test flags). */
  channelOverride?: ApprovalChannel;
  /** Stop the daemon after handling N proposals. Used for deterministic e2e tests. */
  maxProposals?: number;
};

/** All events the daemon can emit. */
export type DaemonEvents = {
  // ── Sync events (emitted directly) ──
  synced: [result: SyncResult];
  "sync:error": [error: Error];
  // ── Proposal events (forwarded from ProposalManager) ──
  proposed: [proposal: Proposal];
  applied: [proposal: Proposal];
  rejected: [proposal: Proposal];
  superseded: [proposal: Proposal];
  "proposal:error": [error: Error, context: string];
};

// ── SoulguardDaemon ────────────────────────────────────────────────────

export class SoulguardDaemon extends EventEmitter<DaemonEvents> {
  private readonly _ops: SystemOperations;
  private readonly _config: SoulguardConfig;
  private readonly _channelOverride: ApprovalChannel | null;
  private readonly _maxProposals: number | null;

  private _channel: ApprovalChannel | null = null;
  private _proposalManager: ProposalManager | null = null;
  private _syncTimer: ReturnType<typeof setInterval> | null = null;
  private _syncRunning = false;
  private _running = false;
  private _doneResolve: (() => void) | null = null;

  constructor(options: DaemonOptions) {
    super();
    this._ops = options.ops;
    this._config = options.config;
    this._channelOverride = options.channelOverride ?? null;
    this._maxProposals = options.maxProposals ?? null;
  }

  get running(): boolean {
    return this._running;
  }

  get proposalManager(): ProposalManager | null {
    return this._proposalManager;
  }

  async start(): Promise<void> {
    if (this._running) return;

    const daemonConfig = this._config.daemon;
    if (!daemonConfig) {
      throw new Error("Daemon configuration missing. Add a 'daemon' section to soulguard.json.");
    }

    // ── Channel + ProposalManager (optional) ────────────────────────────
    if (this._channelOverride) {
      this._channel = this._channelOverride;
    } else {
      const channelName = daemonConfig.channel;
      if (channelName) {
        const createChannelFn = getChannel(channelName);
        if (!createChannelFn) {
          throw new Error(
            `No channel registered for "${channelName}". Register it with registerChannel() before starting the daemon.`,
          );
        }
        const channelConfig = daemonConfig[channelName];
        this._channel = createChannelFn(channelConfig);
      }
    }

    if (this._channel) {
      this._proposalManager = new ProposalManager({
        ops: this._ops,
        config: this._config,
        channel: this._channel,
      });

      // Forward all PM events through the daemon
      this._proposalManager.on("proposed", (...args) => this.emit("proposed", ...args));
      this._proposalManager.on("applied", (...args) => this.emit("applied", ...args));
      this._proposalManager.on("rejected", (...args) => this.emit("rejected", ...args));
      this._proposalManager.on("superseded", (...args) => this.emit("superseded", ...args));
      this._proposalManager.on("error", (...args) => this.emit("proposal:error", ...args));

      // maxProposals: auto-stop after N proposals handled
      if (this._maxProposals != null) {
        let count = 0;
        const checkDone = () => {
          count++;
          if (count >= this._maxProposals!) {
            this.stop();
          }
        };
        this._proposalManager.on("applied", checkDone);
        this._proposalManager.on("rejected", checkDone);
      }

      this._proposalManager.start();
    }

    // ── Sync loop (unless explicitly disabled with syncIntervalSecs: 0) ─
    const syncIntervalSecs = daemonConfig.syncIntervalSecs ?? 60;
    if (syncIntervalSecs > 0) {
      this._runSync(); // immediate first run
      this._syncTimer = setInterval(() => this._runSync(), syncIntervalSecs * 1000);
    }

    this._running = true;
  }

  /** Returns a promise that resolves when the daemon stops (e.g. maxProposals reached). */
  done(): Promise<void> {
    if (!this._running) return Promise.resolve();
    return new Promise((resolve) => {
      this._doneResolve = resolve;
    });
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }

    if (this._proposalManager) {
      await this._proposalManager.stop();
      this._proposalManager = null;
    }

    if (this._channel && !this._channelOverride) {
      await this._channel.dispose();
      this._channel = null;
    }

    this._doneResolve?.();
    this._doneResolve = null;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async _runSync(): Promise<void> {
    if (this._syncRunning) return; // skip if previous run still in progress
    this._syncRunning = true;
    try {
      const treeResult = await StateTree.build({
        ops: this._ops,
        config: this._config,
      });
      if (!treeResult.ok) {
        this.emit("sync:error", new Error(`StateTree.build failed: ${treeResult.error.message}`));
        return;
      }
      const syncResult = await sync({
        tree: treeResult.value,
        ops: this._ops,
        config: this._config,
      });
      if (!syncResult.ok) {
        this.emit("sync:error", new Error(`sync failed: ${syncResult.error.message}`));
        return;
      }
      this.emit("synced", syncResult.value);
    } catch (e) {
      this.emit("sync:error", e instanceof Error ? e : new Error(String(e)));
    } finally {
      this._syncRunning = false;
    }
  }
}
