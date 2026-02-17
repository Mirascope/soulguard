/**
 * OpenClaw configuration templates for Soulguard.
 *
 * These define sensible defaults for OpenClaw's file conventions.
 * Core soulguard is framework-agnostic; templates live here.
 */

import type { SoulguardConfig } from "@soulguard/core";

export type TemplateName = "default" | "paranoid" | "relaxed" | "custom";

export type Template = {
  name: TemplateName;
  description: string;
  config: SoulguardConfig;
};

/** Core session files in vault, memory in ledger */
export const defaultTemplate: Template = {
  name: "default",
  description: "Core session files in vault, memory and skills in ledger",
  config: {
    vault: [
      "SOUL.md",
      "AGENTS.md",
      "IDENTITY.md",
      "USER.md",
      "TOOLS.md",
      "HEARTBEAT.md",
      "BOOTSTRAP.md",
      "soulguard.json",
    ],
    ledger: ["memory/**", "skills/**"],
  },
};

/** Identity + memory in vault, skills in ledger */
export const paranoidTemplate: Template = {
  name: "paranoid",
  description: "Identity and memory files in vault, skills in ledger",
  config: {
    vault: [
      "SOUL.md",
      "AGENTS.md",
      "IDENTITY.md",
      "USER.md",
      "TOOLS.md",
      "HEARTBEAT.md",
      "MEMORY.md",
      "BOOTSTRAP.md",
      "memory/**",
      "soulguard.json",
    ],
    ledger: ["skills/**"],
  },
};

/** Everything in ledger (tracked but not locked) */
export const relaxedTemplate: Template = {
  name: "relaxed",
  description: "All files tracked in ledger, nothing locked in vault",
  config: {
    vault: ["soulguard.json"],
    ledger: [
      "SOUL.md",
      "AGENTS.md",
      "IDENTITY.md",
      "USER.md",
      "TOOLS.md",
      "HEARTBEAT.md",
      "MEMORY.md",
      "BOOTSTRAP.md",
      "memory/**",
      "skills/**",
    ],
  },
};

export const templates: Record<Exclude<TemplateName, "custom">, Template> = {
  default: defaultTemplate,
  paranoid: paranoidTemplate,
  relaxed: relaxedTemplate,
};
