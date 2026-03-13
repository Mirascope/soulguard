/**
 * Proposal manager — orchestrates the proposal lifecycle.
 *
 * Polls staging directory, detects changes via StateTree hash comparison,
 * handles debounce and batch mode, posts proposals to the channel,
 * waits for approval, and calls apply().
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
import { STAGING_DIR } from "../sdk/staging.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ProposalManagerOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  channel: ApprovalChannel;
  workspaceRoot: string;
  /** Debounce period (ms) after last change before proposing. */
  debounceMs?: number;
  /** Max wait (ms) for .wait-for-ready sentinel removal. */
  batchReadyTimeoutMs?: number;
  /** Polling interval (ms). Default: 1000. */
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
  private readonly _workspaceRoot: string;
  private readonly _debounceMs: number;
  private readonly _batchReadyTimeoutMs: number;
  private readonly _pollIntervalMs: number;

  private _activeProposal: Proposal | null = null;
  private _abortController: AbortController | null = null;
  private _pendingFlow: Promise<void> | null = null;

  // Polling state
  private _running = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _batchTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastProposedHash: string | null = null;
  private _inBatchMode = false;
  private _changeDetected = false;

  constructor(options: ProposalManagerOptions) {
    super();
    this._ops = options.ops;
    this._config = options.config;
    this._channel = options.channel;
    this._workspaceRoot = options.workspaceRoot;
    this._debounceMs = options.debounceMs ?? 3000;
    this._batchReadyTimeoutMs = options.batchReadyTimeoutMs ?? 300_000;
    this._pollIntervalMs = options.pollIntervalMs ?? 1000;
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
    this._lastProposedHash = null;
    this._inBatchMode = false;
    this._changeDetected = false;
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), this._pollIntervalMs);
  }

  /** Stop polling and cancel any pending approval. */
  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    this._clearTimers();
    await this._abortPending();
  }

  /** Direct trigger for tests or manual use. */
  async onStagingReady(): Promise<void> {
    await this._propose();
  }

  // ── Polling ────────────────────────────────────────────────────────

  private async _poll(): Promise<void> {
    try {
      const treeResult = await StateTree.build({
        ops: this._ops,
        config: this._config,
      });

      if (!treeResult.ok) return;

      const currentHash = treeResult.value.approvalHash;
      if (currentHash === this._lastProposedHash) return;

      // Check .wait-for-ready sentinel
      const waitPath = `${this._workspaceRoot}/${STAGING_DIR}/.wait-for-ready`;
      const waitResult = await this._ops.exists(waitPath);
      const waitForReady = waitResult.ok && waitResult.value;

      if (waitForReady) {
        this._changeDetected = true;
        if (!this._inBatchMode) {
          this._inBatchMode = true;
          this._batchTimer = setTimeout(() => {
            if (this._running && this._changeDetected) {
              this._triggerProposal();
            }
          }, this._batchReadyTimeoutMs);
        }
        if (this._debounceTimer) {
          clearTimeout(this._debounceTimer);
          this._debounceTimer = null;
        }
        return;
      }

      // Batch mode ended (sentinel removed)
      if (this._inBatchMode && this._changeDetected) {
        this._triggerProposal();
        return;
      }

      // Normal change — debounce
      this._changeDetected = true;
      this._resetDebounce();
    } catch (e) {
      this.emit("error", e instanceof Error ? e : new Error(String(e)), "poll");
    }
  }

  private _resetDebounce(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (this._running && this._changeDetected) {
        this._triggerProposal();
      }
    }, this._debounceMs);
  }

  private _triggerProposal(): void {
    this._changeDetected = false;
    this._inBatchMode = false;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    this._propose().catch((err) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)), "propose");
    });
  }

  // ── Proposal lifecycle ─────────────────────────────────────────────

  private async _propose(): Promise<void> {
    await this._supersedePending();

    // Fresh build required — the poll's tree may be stale after debounce.
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

    // Read description
    const descPath = `${this._workspaceRoot}/${STAGING_DIR}/.description`;
    let description: string | undefined;
    const descContent = await this._ops.readFile(descPath);
    if (descContent.ok) {
      description = descContent.value.trim() || undefined;
    }

    const files: ProposalFile[] = diffResult.value.files.map((df) => ({
      path: df.file.path,
      status: df.file.status as "modified" | "created" | "deleted",
      diff: df.diff,
    }));

    const hash = diffResult.value.approvalHash!;
    const payload: ProposalPayload = { files, hash, description };

    const postResult = await this._channel.postProposal(payload);

    const proposal: Proposal = {
      channel: postResult.channel,
      externalId: postResult.proposalId,
      payload,
      state: "pending",
      createdAt: new Date().toISOString(),
    };

    this._activeProposal = proposal;
    this._lastProposedHash = hash;
    const ac = new AbortController();
    this._abortController = ac;

    this.emit("proposed", proposal);

    this._pendingFlow = this._runApprovalFlow(proposal, ac.signal);
    await this._pendingFlow;
  }

  private async _runApprovalFlow(proposal: Proposal, signal: AbortSignal): Promise<void> {
    try {
      const approvalResult = await this._channel.waitForApproval(proposal.externalId, signal);

      if (approvalResult.approved) {
        const freshTree = await StateTree.build({ ops: this._ops, config: this._config });

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
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
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

  private async _abortPending(): Promise<void> {
    if (this._abortController) this._abortController.abort();
    if (this._pendingFlow) {
      await this._pendingFlow.catch(() => {});
      this._pendingFlow = null;
    }
    this._activeProposal = null;
    this._abortController = null;
  }

  private _clearTimers(): void {
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
  }
}
