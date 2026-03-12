/**
 * Proposal manager — orchestrates the proposal lifecycle.
 *
 * Receives "staging ready" signals, builds StateTree + ProposalPayload,
 * posts to the channel, waits for approval, and calls apply().
 *
 * Only one proposal is active at a time. New signals supersede pending ones.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel, Proposal, ProposalPayload, ProposalFile } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ProposalManagerOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  channel: ApprovalChannel;
  workspaceRoot: string;
};

/** Events the proposal manager can emit for observability. */
export type ProposalManagerEvents = {
  /** A proposal was posted to the channel. */
  proposed: [proposal: Proposal];
  /** A proposal was approved and applied. */
  applied: [proposal: Proposal];
  /** A proposal was rejected by the human. */
  rejected: [proposal: Proposal];
  /** A proposal was superseded by a new one. */
  superseded: [proposal: Proposal];
  /** An error occurred during the proposal lifecycle. */
  error: [error: Error, context: string];
};

// ── ProposalManager ────────────────────────────────────────────────────

export class ProposalManager {
  private readonly _ops: SystemOperations;
  private readonly _config: SoulguardConfig;
  private readonly _channel: ApprovalChannel;
  private readonly _workspaceRoot: string;

  private _activeProposal: Proposal | null = null;
  private _abortController: AbortController | null = null;

  constructor(options: ProposalManagerOptions) {
    this._ops = options.ops;
    this._config = options.config;
    this._channel = options.channel;
    this._workspaceRoot = options.workspaceRoot;
  }

  /** Current active proposal, if any. */
  get activeProposal(): Proposal | null {
    return this._activeProposal;
  }

  /**
   * Handle a "staging ready" signal from the watcher.
   *
   * Supersedes any pending proposal, builds a new StateTree,
   * derives the ProposalPayload, and starts the approval flow.
   */
  async onStagingReady(): Promise<void> {
    throw new Error("Not implemented");
  }

  /**
   * Shut down — cancel any pending approval wait.
   */
  async dispose(): Promise<void> {
    throw new Error("Not implemented");
  }
}
