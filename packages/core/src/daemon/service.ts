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
export function generateServiceFile(options: ServiceFileOptions): string {
  if (options.platform === "systemd") {
    return generateSystemdUnit(options);
  }
  return generateLaunchdPlist(options);
}

/**
 * Get the expected install path for the service file.
 */
export function serviceFilePath(options: {
  platform: ServicePlatform;
  guardianUser: string;
}): string {
  if (options.platform === "systemd") {
    return `/etc/systemd/system/soulguard-${options.guardianUser}.service`;
  }
  return `/Library/LaunchDaemons/com.soulguard.${options.guardianUser}.plist`;
}

// ── Private helpers ────────────────────────────────────────────────────

function generateSystemdUnit(options: ServiceFileOptions): string {
  return `[Unit]
Description=Soulguard daemon for ${options.agentUser}
After=network.target

[Service]
Type=simple
User=${options.guardianUser}
ExecStart=${options.soulguardBin} daemon start
WorkingDirectory=${options.workspaceRoot}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
}

function generateLaunchdPlist(options: ServiceFileOptions): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.soulguard.${options.guardianUser}</string>
  <key>UserName</key>
  <string>${options.guardianUser}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${options.soulguardBin}</string>
    <string>daemon</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${options.workspaceRoot}</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/soulguard-${options.guardianUser}.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/soulguard-${options.guardianUser}.err</string>
</dict>
</plist>
`;
}
