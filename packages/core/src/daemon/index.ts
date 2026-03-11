/**
 * Daemon types and components — re-exported for public API.
 */
export type {
  ProposalFile,
  ProposalPayload,
  PostProposalResult,
  ApprovalResult,
  ProposalOutcome,
  ProposalState,
  Proposal,
  PostResultOutcome,
  ApprovalChannel,
  CreateChannelFn,
} from "./types.js";

export { StagingWatcher } from "./watcher.js";
export type { StagingSnapshot, WatcherEvents, WatcherOptions } from "./watcher.js";
