/**
 * Discord approval channel implementation.
 *
 * Posts proposals as embeds, listens for emoji reactions from approved
 * users, and implements the security model (content verification,
 * edit detection, user ID filtering).
 */

import type {
  ApprovalChannel,
  ProposalPayload,
  PostProposalResult,
  ApprovalResult,
  ProposalOutcome,
  PostResultOutcome,
} from "@soulguard/core";
import type { DiscordConfig } from "./config.js";

export class DiscordChannel implements ApprovalChannel {
  readonly name = "discord";

  private readonly _config: DiscordConfig;

  /** Retained payload for content verification at approval time. */
  private _retainedPayload: ProposalPayload | null = null;

  constructor(config: DiscordConfig) {
    this._config = config;
  }

  async postProposal(_proposal: ProposalPayload): Promise<PostProposalResult> {
    throw new Error("Not implemented");
  }

  async waitForApproval(_proposalId: string, _signal: AbortSignal): Promise<ApprovalResult> {
    throw new Error("Not implemented");
  }

  async postResult(_proposalId: string, _result: ProposalOutcome): Promise<PostResultOutcome> {
    throw new Error("Not implemented");
  }

  async dispose(): Promise<void> {
    throw new Error("Not implemented");
  }
}
