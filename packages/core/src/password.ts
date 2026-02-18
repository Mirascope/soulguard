/**
 * Password types — argon2 hash storage.
 */

/** Argon2 hash stored in .soulguard/.secret */
export type PasswordHash = {
  /** The argon2id hash string */
  hash: string;
};
