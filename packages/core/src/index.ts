export type {
  VaultItem,
  LedgerItem,
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

export { DEFAULT_VAULT_PATHS, DEFAULT_LEDGER_PATTERNS } from "./types.js";
export { soulguardConfigSchema, parseConfig } from "./schema.js";
export type { SoulguardConfigParsed, SoulguardConfigParsed as SoulguardConfig } from "./schema.js";
