# @soulguard/openclaw

OpenClaw framework plugin for soulguard. Provides protection templates and soulguard integration for OpenClaw agents.

For the core system, see [@soulguard/core](../core/).

## Protection Templates

Templates define which paths go to protect, watch, or are left unprotected. Every known path is explicitly categorized — no silent omissions.

Paths are relative to the OpenClaw home directory (`~/.openclaw/`).

| Path                        | Relaxed | Default | Paranoid |
| --------------------------- | :-----: | :-----: | :------: |
| **Config**                  |         |         |          |
| soulguard.json              |   🔒    |   🔒    |    🔒    |
| openclaw.json               |   📒    |   🔒    |    🔒    |
| cron/jobs.json              |   📒    |   🔒    |    🔒    |
| extensions/\*\*             |   📒    |   🔒    |    🔒    |
| **Identity**                |         |         |          |
| workspace/SOUL.md           |   📒    |   🔒    |    🔒    |
| workspace/AGENTS.md         |   📒    |   🔒    |    🔒    |
| workspace/IDENTITY.md       |   📒    |   🔒    |    🔒    |
| workspace/USER.md           |   📒    |   🔒    |    🔒    |
| **Session**                 |         |         |          |
| workspace/TOOLS.md          |   📒    |   🔒    |    🔒    |
| workspace/HEARTBEAT.md      |   📒    |   🔒    |    🔒    |
| workspace/BOOTSTRAP.md      |   📒    |   🔒    |    🔒    |
| **Memory**                  |         |         |          |
| workspace/MEMORY.md         |   📒    |   📒    |    🔒    |
| workspace/memory/\*\*/\*.md |   📒    |   📒    |    🔒    |
| **Skills**                  |         |         |          |
| workspace/skills/\*\*       |   📒    |   📒    |    🔒    |
| **Other**                   |         |         |          |
| workspace/sessions/\*\*     |    —    |    —    |    📒    |

🔒 Protect (requires owner approval) · 📒 Watch (tracked, agent writes freely) · — Unprotected

**Relaxed** — Onboarding mode. Only `soulguard.json` is locked. Everything else tracked.

**Default** — Steady state. Identity files and config locked. Memory and skills tracked.

**Paranoid** — Maximum lockdown. Everything vaulted except sessions.

## Plugin

The OpenClaw plugin integrates soulguard into the agent runtime:

- `before_tool_call` hook intercepts Write/Edit tool calls targeting protect-tier files and redirects to staging
- Reports soulguard status (protect/watch health) in agent context
- Provides helpful error messages guiding the agent to the staging workflow

## Why a Plugin?

Soulguard's core provides hard security via OS file permissions. The agent literally cannot write to protect-tier files. But without the plugin, the agent sees raw `Permission denied` errors and may waste tokens retrying. The plugin:

1. Tells the agent _why_ the write failed
2. Guides it to edit `.soulguard/staging/` instead
3. Provides soulguard operations as native tools

The plugin adds zero security responsibility — if it has bugs, protect-tier files are still protected by OS permissions.
