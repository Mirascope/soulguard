export type {
  VaultItem,
  LedgerItem,
  SoulguardConfig,
  Proposal,
  ProposalStatus,
  ChangelogEntry,
  SocketQuery,
  SocketMutation,
  SocketEvent,
  SocketRequest,
  SocketResponse,
  DaemonStatus,
  InitOptions,
  InitResult,
} from "./types.js";

export { soulguardConfigSchema, parseConfig } from "./schema.js";
export type { SoulguardConfigParsed } from "./schema.js";
