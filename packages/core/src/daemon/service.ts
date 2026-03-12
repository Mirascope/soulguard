/**
 * Service file generation for systemd (Linux) and launchd (macOS).
 *
 * Generates service configuration that runs the daemon as the guardian user.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type ServicePlatform = "systemd" | "launchd";

export type ServiceFileOptions = {
  platform: ServicePlatform;
  /** The agent's system user (e.g. "agent_a"). */
  agentUser: string;
  /** The guardian system user (e.g. "soulguardian_agent_a"). */
  guardianUser: string;
  /** Absolute path to the workspace root. */
  workspaceRoot: string;
  /** Absolute path to the soulguard binary. */
  soulguardBin: string;
};

// ── Generation ─────────────────────────────────────────────────────────

/**
 * Generate a service file for the given platform.
 * @returns The service file content as a string.
 */
export function generateServiceFile(_options: ServiceFileOptions): string {
  throw new Error("Not implemented");
}

/**
 * Get the expected install path for the service file.
 */
export function serviceFilePath(options: {
  platform: ServicePlatform;
  guardianUser: string;
}): string {
  throw new Error("Not implemented");
}
