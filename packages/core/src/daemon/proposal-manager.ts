/**
 * Proposal manager — orchestrates the proposal lifecycle.
 *
 * Receives "staging ready" signals, builds StateTree + ProposalPayload,
 * posts to the channel, waits for approval, and calls apply().
 *
 * Only one proposal is active at a time. New signals supersede pending ones.
 */

import { EventEmitter } from "node:events";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel, Proposal, ProposalPayload, ProposalFile } from "./types.js";
import { diff } from "../sdk/diff.js";
import { apply } from "../sdk/apply.js";
import { StateTree } from "../sdk/state.js";
import { STAGING_DIR } from "../sdk/staging.js";

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

export class ProposalManager extends EventEmitter<ProposalManagerEvents> {
  private readonly _ops: SystemOperations;
  private readonly _config: SoulguardConfig;
  private readonly _channel: ApprovalChannel;
  private readonly _workspaceRoot: string;

  private _activeProposal: Proposal | null = null;
  private _abortController: AbortController | null = null;
  private _pendingFlow: Promise<void> | null = null;

  constructor(options: ProposalManagerOptions) {
    super();
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
   */
  async onStagingReady(): Promise<void> {
    // Step 1: Supersede any pending proposal
    await this._supersedePending();

    // Step 2: Build diff
    const diffResult = await diff({
      ops: this._ops,
      config: this._config,
    });

    if (!diffResult.ok) {
      const error = new Error(`Failed to build diff: ${diffResult.error.message}`);
      this.emit("error", error, "onStagingReady:diff");
      return;
    }

    // Step 3: Empty diff → no proposal
    if (!diffResult.value.hasChanges) {
      return;
    }

    // Step 4: Read description if present
    const descPath = `${STAGING_DIR}/.description`;
    let description: string | undefined;
    const descContent = await this._ops.readFile(descPath);
    if (descContent.ok) {
      description = descContent.value.trim() || undefined;
    }

    // Step 5: Build ProposalPayload
    const files: ProposalFile[] = diffResult.value.files.map((df) => ({
      path: df.file.path,
      status: df.file.status as "modified" | "created" | "deleted",
      diff: df.diff,
    }));

    const payload: ProposalPayload = {
      files,
      hash: diffResult.value.approvalHash!,
      description,
    };

    // Step 6: Post proposal to channel
    const postResult = await this._channel.postProposal(payload);

    // Step 7: Create Proposal record
    const proposal: Proposal = {
      channel: postResult.channel,
      externalId: postResult.proposalId,
      payload,
      state: "pending",
      createdAt: new Date().toISOString(),
    };

    this._activeProposal = proposal;
    const ac = new AbortController();
    this._abortController = ac;

    this.emit("proposed", proposal);

    // Step 8: Run approval flow
    this._pendingFlow = this._runApprovalFlow(proposal, ac.signal);
    await this._pendingFlow;
  }

  private async _runApprovalFlow(proposal: Proposal, signal: AbortSignal): Promise<void> {
    try {
      const approvalResult = await this._channel.waitForApproval(proposal.externalId, signal);

      if (approvalResult.approved) {
        // Content verification: build fresh StateTree, compare hash
        const freshTree = await StateTree.build({
          ops: this._ops,
          config: this._config,
        });

        if (!freshTree.ok) {
          const error = new Error(`Failed to build fresh state tree: ${freshTree.error.message}`);
          this.emit("error", error, "approval:verification");
          proposal.state = "rejected";
          this._activeProposal = null;
          await this._channel.postResult(proposal.externalId, "rejected");
          this.emit("rejected", proposal);
          return;
        }

        if (freshTree.value.approvalHash !== proposal.payload.hash) {
          proposal.state = "rejected";
          this._activeProposal = null;
          await this._channel.postResult(proposal.externalId, "rejected");
          this.emit("rejected", proposal);
          return;
        }

        // Apply changes
        const applyResult = await apply({
          ops: this._ops,
          tree: freshTree.value,
          hash: proposal.payload.hash,
        });

        if (!applyResult.ok) {
          const error = new Error(`Apply failed: ${applyResult.error.kind}`);
          this.emit("error", error, "approval:apply");
          proposal.state = "rejected";
          this._activeProposal = null;
          await this._channel.postResult(proposal.externalId, "rejected");
          this.emit("rejected", proposal);
          return;
        }

        proposal.state = "approved";
        this._activeProposal = null;
        await this._channel.postResult(proposal.externalId, "applied");
        this.emit("applied", proposal);
      } else {
        proposal.state = "rejected";
        this._activeProposal = null;
        await this._channel.postResult(proposal.externalId, "rejected");
        this.emit("rejected", proposal);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      const error = e instanceof Error ? e : new Error(String(e));
      this.emit("error", error, "approval:wait");
      proposal.state = "rejected";
      this._activeProposal = null;
    }
  }

  private async _supersedePending(): Promise<void> {
    if (this._activeProposal && this._abortController) {
      const oldProposal = this._activeProposal;
      const oldController = this._abortController;

      oldProposal.state = "superseded";
      this._activeProposal = null;
      this._abortController = null;

      oldController.abort();

      if (this._pendingFlow) {
        await this._pendingFlow.catch(() => {});
        this._pendingFlow = null;
      }

      await this._channel.postResult(oldProposal.externalId, "superseded");
      this.emit("superseded", oldProposal);
    }
  }

  /**
   * Shut down — cancel any pending approval wait.
   */
  async dispose(): Promise<void> {
    if (this._abortController) {
      this._abortController.abort();
    }

    if (this._pendingFlow) {
      await this._pendingFlow.catch(() => {});
      this._pendingFlow = null;
    }

    this._activeProposal = null;
    this._abortController = null;
  }
}
