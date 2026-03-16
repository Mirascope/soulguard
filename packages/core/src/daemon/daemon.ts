/**
 * SoulguardDaemon — top-level orchestrator.
 *
 * Loads channel plugin, creates proposal manager, starts polling.
 * The proposal manager handles everything: polling, debounce, proposals.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel } from "./types.js";
import { getChannel } from "./channel-registry.js";
import { ProposalManager } from "./proposal-manager.js";

// ── Types ──────────────────────────────────────────────────────────────

export type DaemonOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
};

// ── SoulguardDaemon ────────────────────────────────────────────────────

export class SoulguardDaemon {
  private readonly _ops: SystemOperations;
  private readonly _config: SoulguardConfig;

  private _channel: ApprovalChannel | null = null;
  private _proposalManager: ProposalManager | null = null;
  private _running = false;

  constructor(options: DaemonOptions) {
    this._ops = options.ops;
    this._config = options.config;
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
    console.log(
      `[daemon] channel: "${channelName}", config keys: ${JSON.stringify(Object.keys(daemonConfig))}`,
    );

    const createChannelFn = getChannel(channelName);
    if (!createChannelFn) {
      throw new Error(
        `No channel registered for "${channelName}". Register it with registerChannel() before starting the daemon.`,
      );
    }

    const channelConfig = daemonConfig[channelName];
    console.log(
      `[daemon] channelConfig present: ${!!channelConfig}, keys: ${channelConfig ? JSON.stringify(Object.keys(channelConfig as Record<string, unknown>)) : "n/a"}`,
    );
    this._channel = createChannelFn(channelConfig);
    console.log(`[daemon] channel created: ${this._channel.name}`);

    this._proposalManager = new ProposalManager({
      ops: this._ops,
      config: this._config,
      channel: this._channel,
    });

    console.log(`[daemon] starting proposal manager`);
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
