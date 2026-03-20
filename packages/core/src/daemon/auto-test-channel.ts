/**
 * Built-in test channel that immediately approves or rejects proposals.
 *
 * Used by --test-auto-approve / --test-auto-reject CLI flags for e2e testing.
 * Not registered in the channel registry — injected directly via channelOverride.
 */

import type {
  ApprovalChannel,
  ApprovalResult,
  PostProposalResult,
  PostResultOutcome,
  ProposalOutcome,
  ProposalPayload,
} from "./types.js";

export class AutoTestChannel implements ApprovalChannel {
  readonly name = "auto-test";
  private readonly _approve: boolean;
  private _nextId = 1;

  constructor(approve: boolean) {
    this._approve = approve;
  }

  async postProposal(_proposal: ProposalPayload): Promise<PostProposalResult> {
    return { channel: "auto-test", proposalId: `auto-${this._nextId++}` };
  }

  async waitForApproval(_proposalId: string, _signal: AbortSignal): Promise<ApprovalResult> {
    return {
      approved: this._approve,
      channel: "auto-test",
      approver: "auto-test",
    };
  }

  async postResult(_proposalId: string, _result: ProposalOutcome): Promise<PostResultOutcome> {
    return { ok: true };
  }

  async dispose(): Promise<void> {}
}
