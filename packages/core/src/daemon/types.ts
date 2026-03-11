/**
 * Remote approval daemon types.
 *
 * Defines the ApprovalChannel plugin interface and proposal lifecycle types.
 * Channel implementations (e.g. @soulguard/discord) implement ApprovalChannel.
 * The daemon core orchestrates the lifecycle.
 */

// ── Proposal types ─────────────────────────────────────────────────────

/** Per-file change in a proposal. */
export type ProposalFile = {
  /** Relative path from workspace root. */
  path: string;
  /** What kind of change. */
  status: "modified" | "created" | "deleted";
  /** Unified diff text for this file. */
  diff: string;
};

/** Payload sent to a channel when posting a new proposal. */
export type ProposalPayload = {
  /** Per-file changes with diffs. */
  files: ProposalFile[];
  /** SHA-256 approval hash over the staged file contents. */
  hash: string;
  /** Optional agent-provided description of the changes. */
  description?: string;
};

/** Result from posting a proposal to a channel. */
export type PostProposalResult = {
  /** Which channel posted the proposal (e.g. "discord"). */
  channel: string;
  /** Channel-specific proposal ID (e.g. Discord message ID). */
  proposalId: string;
};

/** Result from a channel's approval wait. */
export type ApprovalResult = {
  /** Whether the proposal was approved. */
  approved: boolean;
  /** Which channel the approval came from. */
  channel: string;
  /** Identifier of the approver (e.g. Discord user ID). */
  approver: string;
};

/** Terminal outcomes for a proposal. */
export type ProposalOutcome = "applied" | "rejected" | "superseded";

/** Proposal lifecycle states. */
export type ProposalState = "pending" | "approved" | "rejected" | "superseded";

/** A tracked proposal with its channel-specific ID and snapshot. */
export type Proposal = {
  /** Which channel this proposal was posted to. */
  channel: string;
  /** Channel-specific proposal ID (e.g. Discord message ID). */
  externalId: string;
  /** The payload that was posted to the channel. */
  payload: ProposalPayload;
  /** Current lifecycle state. */
  state: ProposalState;
  /** ISO-8601 timestamp when the proposal was created. */
  createdAt: string;
};

/** Result from posting an outcome back to the channel. */
export type PostResultOutcome = {
  /** Whether the result was posted successfully. */
  ok: boolean;
  /** Error message if posting failed. */
  error?: string;
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
  /** Channel name (e.g. "discord", "slack"). Used to tag proposals and results. */
  readonly name: string;

  /**
   * Post a proposal to the channel.
   * @returns Result with channel name and channel-specific proposal ID.
   */
  postProposal(proposal: ProposalPayload): Promise<PostProposalResult>;

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
   * @returns Result indicating success or failure with optional error message.
   */
  postResult(proposalId: string, result: ProposalOutcome): Promise<PostResultOutcome>;

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
