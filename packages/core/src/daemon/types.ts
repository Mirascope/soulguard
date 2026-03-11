/**
 * Remote approval daemon types.
 *
 * Defines the ApprovalChannel plugin interface and proposal lifecycle types.
 * Channel implementations (e.g. @soulguard/discord) implement ApprovalChannel.
 * The daemon core orchestrates the lifecycle.
 */

// ── Proposal types ─────────────────────────────────────────────────────

/** Payload sent to a channel when posting a new proposal. */
export type ProposalPayload = {
  /** Unified diff text of all staged changes. */
  diff: string;
  /** SHA-256 approval hash over the staged file contents. */
  hash: string;
  /** Optional agent-provided description of the changes. */
  description?: string;
};

/** Result from a channel's approval wait. */
export type ApprovalResult = {
  /** Whether the proposal was approved. */
  approved: boolean;
  /** Identifier of the approver (e.g. Discord user ID). */
  approver: string;
};

/** Terminal outcomes for a proposal. */
export type ProposalOutcome = "applied" | "rejected" | "superseded";

/** Proposal lifecycle states. */
export type ProposalState = "pending" | "approved" | "rejected" | "superseded";

/** A tracked proposal with its channel-specific ID and snapshot. */
export type Proposal = {
  /** Channel-specific proposal ID (e.g. Discord message ID). */
  externalId: string;
  /** The payload that was posted to the channel. */
  payload: ProposalPayload;
  /** Current lifecycle state. */
  state: ProposalState;
  /** ISO-8601 timestamp when the proposal was created. */
  createdAt: string;
};

// ── ApprovalChannel interface ──────────────────────────────────────────

/**
 * Plugin interface for approval transports.
 *
 * Each channel implementation (Discord, Slack, etc.) implements this
 * interface. The daemon core calls these methods to manage the proposal
 * lifecycle without knowing the transport details.
 *
 * Implementations are loaded via dynamic import:
 *   `"channel": "discord"` → `import("@soulguard/discord")`
 *   The imported module must export `createChannel(config: unknown): ApprovalChannel`
 */
export interface ApprovalChannel {
  /**
   * Post a proposal to the channel.
   * @returns Channel-specific proposal ID (e.g. Discord message ID).
   */
  postProposal(proposal: ProposalPayload): Promise<string>;

  /**
   * Wait for a human to approve or reject the proposal.
   *
   * This is long-lived — it may block for minutes or hours.
   * The signal is used to abort on supersession (new proposal replaces this one).
   *
   * @param proposalId - The ID returned by postProposal.
   * @param signal - AbortSignal for cancellation on supersession.
   * @throws {AbortError} when signal is aborted (supersession).
   */
  waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult>;

  /**
   * Post the outcome of a proposal back to the channel.
   *
   * Best-effort — the apply/reject has already happened by the time this is called.
   * @returns true if the result was posted successfully, false otherwise.
   */
  postResult(proposalId: string, result: ProposalOutcome): Promise<boolean>;

  /**
   * Clean up resources (close connections, stop listeners).
   */
  dispose(): Promise<void>;
}

// ── Channel factory ────────────────────────────────────────────────────

/**
 * Factory function that channel packages must export.
 *
 * @example
 * // In @soulguard/discord:
 * export const createChannel: CreateChannelFn = (config) => {
 *   return new DiscordChannel(config as DiscordConfig);
 * };
 */
export type CreateChannelFn = (config: unknown) => ApprovalChannel;
