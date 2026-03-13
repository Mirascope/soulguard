/**
 * Service file generation tests.
 */

import { describe, test, expect } from "bun:test";
import { generateServiceFile, serviceFilePath } from "./service.js";

const baseOptions = {
  agentUser: "agent_a",
  guardianUser: "soulguardian_agent_a",
  workspaceRoot: "/home/agent_a/workspace",
  soulguardBin: "/usr/local/bin/soulguard",
};

describe("generateServiceFile", () => {
  // ── systemd ────────────────────────────────────────────────────────

  test("generates valid systemd unit for guardian user", () => {
    const result = generateServiceFile({ ...baseOptions, platform: "systemd" });

    expect(result).toContain("[Unit]");
    expect(result).toContain("[Service]");
    expect(result).toContain("[Install]");
    expect(result).toContain("User=soulguardian_agent_a");
    expect(result).toContain("ExecStart=/usr/local/bin/soulguard daemon start");
    expect(result).toContain("WorkingDirectory=/home/agent_a/workspace");
  });

  test("systemd unit has restart policy", () => {
    const result = generateServiceFile({ ...baseOptions, platform: "systemd" });

    expect(result).toContain("Restart=on-failure");
  });

  // ── launchd ────────────────────────────────────────────────────────

  test("generates valid launchd plist for guardian user", () => {
    const result = generateServiceFile({ ...baseOptions, platform: "launchd" });

    expect(result).toContain("<?xml");
    expect(result).toContain("<plist");
    expect(result).toContain("<key>UserName</key>");
    expect(result).toContain("<string>soulguardian_agent_a</string>");
    expect(result).toContain("<string>/usr/local/bin/soulguard</string>");
    expect(result).toContain("<string>daemon</string>");
    expect(result).toContain("<string>start</string>");
    expect(result).toContain("<key>WorkingDirectory</key>");
    expect(result).toContain("<string>/home/agent_a/workspace</string>");
  });

  test("launchd plist has KeepAlive", () => {
    const result = generateServiceFile({ ...baseOptions, platform: "launchd" });

    expect(result).toContain("<key>KeepAlive</key>");
    expect(result).toContain("<true/>");
  });

  // ── Paths ──────────────────────────────────────────────────────────

  test("serviceFilePath returns correct systemd path", () => {
    const path = serviceFilePath({ platform: "systemd", guardianUser: "soulguardian_agent_a" });
    expect(path).toBe("/etc/systemd/system/soulguard-soulguardian_agent_a.service");
  });

  test("serviceFilePath returns correct launchd path", () => {
    const path = serviceFilePath({ platform: "launchd", guardianUser: "soulguardian_agent_a" });
    expect(path).toBe("/Library/LaunchDaemons/com.soulguard.soulguardian_agent_a.plist");
  });
});
