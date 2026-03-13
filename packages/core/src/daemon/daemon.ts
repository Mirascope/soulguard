/**
 * SoulguardDaemon — top-level orchestrator.
 *
 * Wires watcher → proposal manager → channel plugin.
 * Handles channel plugin discovery via dynamic import.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel, CreateChannelFn } from "./types.js";
import { StagingWatcher } from "./watcher.js";
import { ProposalManager } from "./proposal-manager.js";
import { DEFAULT_DEBOUNCE_MS, DEFAULT_BATCH_READY_TIMEOUT_MS } from "../sdk/schema.js";
import { STAGING_DIR } from "../sdk/staging.js";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export type DaemonOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  workspaceRoot: string;
};

// ── SoulguardDaemon ────────────────────────────────────────────────────

export class SoulguardDaemon {
  private readonly _ops: SystemOperations;
  private readonly _config: SoulguardConfig;
  private readonly _workspaceRoot: string;

  private _channel: ApprovalChannel | null = null;
  private _watcher: StagingWatcher | null = null;
  private _proposalManager: ProposalManager | null = null;
  private _running = false;

  constructor(options: DaemonOptions) {
    this._ops = options.ops;
    this._config = options.config;
    this._workspaceRoot = options.workspaceRoot;
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * Start the daemon: load channel plugin, start watcher, wire events.
   */
  async start(): Promise<void> {
    if (this._running) return;

    const daemonConfig = this._config.daemon;
    if (!daemonConfig) {
      throw new Error("Daemon configuration missing. Add a 'daemon' section to soulguard.json.");
    }

    const channelName = daemonConfig.channel;

    // Dynamic import of channel plugin
    let channelModule: { createChannel: CreateChannelFn };
    try {
      channelModule = await import(`@soulguard/${channelName}`);
    } catch {
      throw new Error(
        `Failed to load channel plugin. Install @soulguard/${channelName} to use the ${channelName} channel.`,
      );
    }

    const channelConfig = daemonConfig[channelName];
    this._channel = channelModule.createChannel(channelConfig);

    // Create watcher
    const stagingDir = join(this._workspaceRoot, STAGING_DIR);
    this._watcher = new StagingWatcher({
      ops: this._ops,
      stagingDir,
      debounceMs: daemonConfig.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      batchReadyTimeoutMs: daemonConfig.batchReadyTimeoutMs ?? DEFAULT_BATCH_READY_TIMEOUT_MS,
    });

    // Create proposal manager
    this._proposalManager = new ProposalManager({
      ops: this._ops,
      config: this._config,
      channel: this._channel,
      workspaceRoot: this._workspaceRoot,
    });

    // Wire events
    this._watcher.on("proposal", () => {
      this._proposalManager?.onStagingReady().catch((err) => {
        console.error("[soulguard] Proposal error:", err);
      });
    });

    this._watcher.on("error", (err) => {
      console.error("[soulguard] Watcher error:", err);
    });

    // Start
    this._watcher.start();
    this._running = true;
  }

  /**
   * Stop the daemon: dispose channel, stop watcher, cancel proposals.
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    this._running = false;

    if (this._watcher) {
      this._watcher.stop();
      this._watcher = null;
    }

    if (this._proposalManager) {
      await this._proposalManager.dispose();
      this._proposalManager = null;
    }

    if (this._channel) {
      await this._channel.dispose();
      this._channel = null;
    }
  }
}
