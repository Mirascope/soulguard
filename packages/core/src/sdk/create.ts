/**
 * soulguard create — create empty staging copies for new files in protected paths.
 *
 * Used when an agent wants to propose a new file that doesn't exist yet.
 * The path must be covered by the protect tier in the config.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { stagingPath } from "./staging.js";
import { protectPatterns } from "./config.js";
import { isInProtectTier, ensureStagingParentDir } from "./staging-ops.js";

// ── Types ──────────────────────────────────────────────────────────────

export type CreateOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Single path to create in staging */
  path: string;
};

export type CreateResult = {
  path: string;
  /** True if the file already existed on disk (staging copy was auto-created). */
  alreadyExisted: boolean;
};

export type CreateError =
  | { kind: "not_in_protect_tier"; path: string }
  | { kind: "create_failed"; path: string; message: string };

// ── Main Function ──────────────────────────────────────────────────────

/**
 * Create an empty staging copy for a new file in a protected path.
 *
 * The file must not already exist on disk (existing files get staging copies
 * automatically via protect/sync).
 */
export async function create(options: CreateOptions): Promise<Result<CreateResult, CreateError>> {
  const { ops, config, path } = options;

  // 1. Validate path is in protect tier
  if (!isInProtectTier(path, protectPatterns(config))) {
    return err({ kind: "not_in_protect_tier", path });
  }

  // 2. If path already exists on disk, staging copy was auto-created — no-op
  const exists = await ops.exists(path);
  if (exists.ok && exists.value) {
    return ok({ path, alreadyExisted: true });
  }

  // 3. Create empty staging entry
  const stagePath = stagingPath(path);

  const parentResult = await ensureStagingParentDir(ops, path);
  if (!parentResult.ok) {
    return err({ kind: "create_failed", path, message: parentResult.error });
  }

  const writeResult = await ops.writeFile(stagePath, "");
  if (!writeResult.ok) {
    return err({
      kind: "create_failed",
      path,
      message: `Cannot create staging file: ${writeResult.error.kind}`,
    });
  }

  return ok({ path, alreadyExisted: false });
}
