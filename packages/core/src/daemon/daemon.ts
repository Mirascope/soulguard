/**
 * SoulguardDaemon — top-level orchestrator.
 *
 * Loads channel plugin, creates proposal manager, starts polling.
 * The proposal manager handles everything: polling, debounce, proposals.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel, CreateChannelFn } from "./types.js";
import { ProposalManager } from "./proposal-manager.js";
import { DEFAULT_DEBOUNCE_MS, DEFAULT_BATCH_READY_TIMEOUT_MS } from "../sdk/schema.js";

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

  get proposalManager(): ProposalManager | null {
    return this._proposalManager;
  }

  async start(): Promise<void> {
    if (this._running) return;

    const daemonConfig = this._config.daemon;
    if (!daemonConfig) {
      throw new Error("Daemon configuration missing. Add a 'daemon' section to soulguard.json.");
    }

    const channelName = daemonConfig.channel;

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

    this._proposalManager = new ProposalManager({
      ops: this._ops,
      config: this._config,
      channel: this._channel,
      workspaceRoot: this._workspaceRoot,
      debounceMs: daemonConfig.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      batchReadyTimeoutMs: daemonConfig.batchReadyTimeoutMs ?? DEFAULT_BATCH_READY_TIMEOUT_MS,
    });

    this._proposalManager.start();
    this._running = true;
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    if (this._proposalManager) {
      await this._proposalManager.stop();
      this._proposalManager = null;
    }

    if (this._channel) {
      await this._channel.dispose();
      this._channel = null;
    }
  }
}
