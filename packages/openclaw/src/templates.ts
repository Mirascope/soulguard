/**
 * OpenClaw protection templates for Soulguard.
 *
 * Each template partitions the same set of known paths into protect, watch,
 * and release tiers. This makes templates authoritative — switching from
 * paranoid to relaxed will release previously protected paths.
 *
 * Paths are relative to the OpenClaw home directory (~/.openclaw/).
 * Trailing "/" marks directories.
 * soulguard.json is omitted — init auto-protects it.
 */

export type TemplateName = "default" | "paranoid" | "relaxed";

export type Template = {
  name: TemplateName;
  description: string;
  protect: readonly string[];
  watch: readonly string[];
  release: readonly string[];
};

/** All known paths — every template must partition exactly this set. */
export const ALL_KNOWN_PATHS = [
  "workspace/SOUL.md",
  "workspace/AGENTS.md",
  "workspace/IDENTITY.md",
  "workspace/USER.md",
  "workspace/TOOLS.md",
  "workspace/HEARTBEAT.md",
  "workspace/BOOTSTRAP.md",
  "workspace/MEMORY.md",
  "workspace/memory/",
  "workspace/skills/",
  "workspace/sessions/",
  "openclaw.json",
  "cron/",
  "extensions/",
] as const;

export const templates: Record<TemplateName, Template> = {
  default: {
    name: "default",
    description: "Core identity and config protected, memory and skills watched",
    protect: [
      "workspace/SOUL.md",
      "workspace/AGENTS.md",
      "workspace/IDENTITY.md",
      "workspace/USER.md",
      "workspace/TOOLS.md",
      "workspace/HEARTBEAT.md",
      "workspace/BOOTSTRAP.md",
      "openclaw.json",
      "extensions/",
    ],
    watch: ["workspace/MEMORY.md", "workspace/memory/", "workspace/skills/", "cron/"],
    release: ["workspace/sessions/"],
  },

  paranoid: {
    name: "paranoid",
    description: "Everything protected, only sessions watched",
    protect: [
      "workspace/SOUL.md",
      "workspace/AGENTS.md",
      "workspace/IDENTITY.md",
      "workspace/USER.md",
      "workspace/TOOLS.md",
      "workspace/HEARTBEAT.md",
      "workspace/BOOTSTRAP.md",
      "workspace/MEMORY.md",
      "workspace/memory/",
      "workspace/skills/",
      "openclaw.json",
      "cron/",
      "extensions/",
    ],
    watch: ["workspace/sessions/"],
    release: [],
  },

  relaxed: {
    name: "relaxed",
    description: "Everything watched — good for initial setup",
    protect: [],
    watch: [
      "workspace/SOUL.md",
      "workspace/AGENTS.md",
      "workspace/IDENTITY.md",
      "workspace/USER.md",
      "workspace/TOOLS.md",
      "workspace/HEARTBEAT.md",
      "workspace/BOOTSTRAP.md",
      "workspace/MEMORY.md",
      "workspace/memory/",
      "workspace/skills/",
      "openclaw.json",
      "cron/",
      "extensions/",
    ],
    release: ["workspace/sessions/"],
  },
};
