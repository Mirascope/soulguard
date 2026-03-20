/**
 * Proposal manager — orchestrates the proposal lifecycle.
 *
 * Polls staging directory, detects changes via StateTree hash comparison,
 * posts proposals to the channel, waits for approval, and applies.
 *
 * Only one proposal is active at a time. New changes supersede pending ones.
 */

import { EventEmitter } from "node:events";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel, Proposal, ProposalPayload, ProposalFile } from "./types.js";
import { diff } from "../sdk/diff.js";
import { apply } from "../sdk/apply.js";
import { StateTree } from "../sdk/state.js";
import { createStagingCopy } from "../sdk/staging-ops.js";
import { stagingPath } from "../sdk/staging.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ProposalManagerOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  channel: ApprovalChannel;
  /** Polling interval (ms). Default: 2000. */
  pollIntervalMs?: number;
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
  private readonly _pollIntervalMs: number;

  private _activeProposal: Proposal | null = null;
  private _abortController: AbortController | null = null;
  private _pendingFlow: Promise<void> | null = null;

  private _running = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Hash we're currently proposing or waiting on approval for. Set synchronously in _poll. */
  private _pendingProposalHash: string | null = null;

  constructor(options: ProposalManagerOptions) {
    super();
    this._ops = options.ops;
    this._config = options.config;
    this._channel = options.channel;
    this._pollIntervalMs = options.pollIntervalMs ?? 2000;
  }

  get activeProposal(): Proposal | null {
    return this._activeProposal;
  }

  get running(): boolean {
    return this._running;
  }

  /** Start polling for staging changes. */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._pendingProposalHash = null;
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), this._pollIntervalMs);
  }

  /** Stop polling and cancel any pending approval. */
  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    await this._abortPending();
  }

  /** Direct trigger for tests or manual use. */
  async onStagingReady(): Promise<void> {
    this._pendingFlow = this._propose();
    await this._pendingFlow;
  }

  // ── Polling ────────────────────────────────────────────────────────

  private async _poll(): Promise<void> {
    try {
      const treeResult = await StateTree.build({
        ops: this._ops,
        config: this._config,
      });

      if (!treeResult.ok) {
        console.log(`[poll] StateTree.build failed: ${treeResult.error.message}`);
        return;
      }

      const currentHash = treeResult.value.approvalHash;
      if (currentHash === this._pendingProposalHash) return;

      console.log(
        `[poll] hash changed: ${this._pendingProposalHash?.slice(0, 12) ?? "null"} → ${currentHash?.slice(0, 12) ?? "null"}`,
      );

      // Set synchronously so the next poll tick sees it before any awaits
      this._pendingProposalHash = currentHash;

      this._pendingFlow = this._propose().catch((err) => {
        this.emit("error", err instanceof Error ? err : new Error(String(err)), "propose");
      });
    } catch (e) {
      this.emit("error", e instanceof Error ? e : new Error(String(e)), "poll");
    }
  }

  // ── Proposal lifecycle ─────────────────────────────────────────────

  private async _propose(): Promise<void> {
    await this._supersedePending();

    const treeResult = await StateTree.build({ ops: this._ops, config: this._config });
    if (!treeResult.ok) {
      this.emit(
        "error",
        new Error(`Failed to build state tree: ${treeResult.error.message}`),
        "propose:tree",
      );
      return;
    }

    const diffResult = await diff({ tree: treeResult.value, ops: this._ops });
    if (!diffResult.ok) {
      this.emit(
        "error",
        new Error(`Failed to build diff: ${diffResult.error.message}`),
        "propose:diff",
      );
      return;
    }

    if (!diffResult.value.hasChanges) return;

    const files: ProposalFile[] = diffResult.value.files.map((df) => ({
      path: df.file.path,
      status: df.file.status as "modified" | "created" | "deleted",
      diff: df.diff,
    }));

    const hash = diffResult.value.approvalHash!;
    const payload: ProposalPayload = { files, hash };

    const postResult = await this._channel.postProposal(payload);

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

    await this._runApprovalFlow(proposal, ac.signal);
    this._pendingFlow = null;
  }

  private async _runApprovalFlow(proposal: Proposal, signal: AbortSignal): Promise<void> {
    try {
      const approvalResult = await this._channel.waitForApproval(proposal.externalId, signal);

      if (approvalResult.approved) {
        const freshTree = await StateTree.build({ ops: this._ops, config: this._config });

        if (!freshTree.ok) {
          const error = new Error(`Failed to build fresh state tree: ${freshTree.error.message}`);
          this.emit("error", error, "approval:verification");
          await this._rejectProposal(proposal);
          return;
        }

        if (freshTree.value.approvalHash !== proposal.payload.hash) {
          await this._rejectProposal(proposal);
          return;
        }

        const applyResult = await apply({
          ops: this._ops,
          tree: freshTree.value,
          hash: proposal.payload.hash,
        });

        if (!applyResult.ok) {
          const error = new Error(`Apply failed: ${applyResult.error.kind}`);
          this.emit("error", error, "approval:apply");
          await this._rejectProposal(proposal);
          return;
        }

        proposal.state = "approved";
        this._activeProposal = null;
        await this._channel.postResult(proposal.externalId, "applied");
        this.emit("applied", proposal);
      } else {
        await this._rejectProposal(proposal);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      const error = e instanceof Error ? e : new Error(String(e));
      this.emit("error", error, "approval:wait");
      await this._rejectProposal(proposal);
    }
  }

  private async _rejectProposal(proposal: Proposal): Promise<void> {
    proposal.state = "rejected";
    await this._resetStaging(proposal);
    this._pendingProposalHash = null;
    this._activeProposal = null;
    await this._channel.postResult(proposal.externalId, "rejected");
    this.emit("rejected", proposal);
  }

  private async _supersedePending(): Promise<void> {
    if (this._activeProposal && this._abortController) {
      const oldProposal = this._activeProposal;
      const oldController = this._abortController;

      this._activeProposal = null;
      this._abortController = null;

      oldController.abort();
      if (this._pendingFlow) {
        await this._pendingFlow.catch(() => {});
        this._pendingFlow = null;
      }

      // If the approval flow already completed (applied/rejected) before
      // the abort took effect, don't also emit superseded.
      if (oldProposal.state !== "pending") return;

      oldProposal.state = "superseded";
      await this._channel.postResult(oldProposal.externalId, "superseded");
      this.emit("superseded", oldProposal);
    }
  }

  private async _abortPending(): Promise<void> {
    if (this._abortController) this._abortController.abort();
    if (this._pendingFlow) {
      await this._pendingFlow.catch(() => {});
      this._pendingFlow = null;
    }
    this._activeProposal = null;
    this._abortController = null;
  }

  /**
   * Reset staging copies for all files in a rejected proposal.
   *
   * Modified/deleted files: re-copy canonical → staging (agent-writable).
   * Created files: delete the staging copy (no canonical to restore from).
   *
   * Best-effort per file — errors are emitted but don't block the rejection.
   */
  private async _resetStaging(proposal: Proposal): Promise<void> {
    const defaultOwnership = this._config.defaultOwnership;

    for (const file of proposal.payload.files) {
      const result =
        file.status === "created"
          ? await this._ops.deleteFile(stagingPath(file.path))
          : await createStagingCopy(this._ops, file.path, defaultOwnership);
      if (!result.ok) {
        this.emit(
          "error",
          new Error(`Reset staging failed for ${file.path}: ${String(result.error)}`),
          `resetStaging:${file.path}`,
        );
      }
    }
  }
}
