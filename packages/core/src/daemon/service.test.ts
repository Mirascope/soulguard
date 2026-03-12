/**
 * Service file generation tests.
 */

import { describe, test } from "bun:test";
import { generateServiceFile, serviceFilePath } from "./service.js";

describe("generateServiceFile", () => {
  // ── systemd ────────────────────────────────────────────────────────

  test.skip("generates valid systemd unit for guardian user", () => {
    // Expect: [Unit], [Service], [Install] sections
    // User= matches guardianUser
    // ExecStart= points to soulguard daemon start
    // WorkingDirectory= matches workspaceRoot
  });

  test.skip("systemd unit has restart policy", () => {
    // Restart=on-failure or similar
  });

  // ── launchd ────────────────────────────────────────────────────────

  test.skip("generates valid launchd plist for guardian user", () => {
    // Expect: valid XML plist
    // UserName matches guardianUser
    // ProgramArguments points to soulguard daemon start
    // WorkingDirectory matches workspaceRoot
  });

  test.skip("launchd plist has KeepAlive", () => {
    // KeepAlive = true for auto-restart
  });

  // ── Paths ──────────────────────────────────────────────────────────

  test.skip("serviceFilePath returns correct systemd path", () => {
    // /etc/systemd/system/soulguard-<guardian>.service
  });

  test.skip("serviceFilePath returns correct launchd path", () => {
    // /Library/LaunchDaemons/com.soulguard.<guardian>.plist
  });
});
