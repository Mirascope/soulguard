/**
 * Init types — soulguard init result and errors.
 */

import type { SyncResult } from "./sync.js";

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  /** Whether the system user was created (false if it already existed) */
  userCreated: boolean;
  /** Whether the system group was created (false if it already existed) */
  groupCreated: boolean;
  /** Whether the password hash was written (false if it already existed) */
  passwordSet: boolean;
  /** Whether soulguard.json was written (false if it already existed) */
  configCreated: boolean;
  /** Sync result from the initial sync after setup */
  syncResult: SyncResult;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "user_creation_failed"; message: string }
  | { kind: "group_creation_failed"; message: string }
  | { kind: "password_hash_failed"; message: string }
  | { kind: "config_write_failed"; message: string };
