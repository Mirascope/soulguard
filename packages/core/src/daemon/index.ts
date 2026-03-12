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
export type { WatcherEvents, WatcherOptions } from "./watcher.js";

export { ProposalManager } from "./proposal-manager.js";
export type { ProposalManagerOptions, ProposalManagerEvents } from "./proposal-manager.js";

export { SoulguardDaemon } from "./daemon.js";
export type { DaemonOptions } from "./daemon.js";

export { generateServiceFile, serviceFilePath } from "./service.js";
export type { ServicePlatform, ServiceFileOptions } from "./service.js";
