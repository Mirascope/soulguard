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
    throw new Error("Not implemented");
  }

  /**
   * Stop the daemon: dispose channel, stop watcher, cancel proposals.
   */
  async stop(): Promise<void> {
    throw new Error("Not implemented");
  }
}
