# @soulguard/openclaw

OpenClaw framework plugin for soulguard. Provides protection templates and soulguard integration for OpenClaw agents.

For the core system, see [@soulguard/core](../core/).

## Protection Templates

Templates define which paths go to vault, ledger, or are left unprotected. Every known path is explicitly categorized — no silent omissions.

| Path            | Relaxed | Default | Paranoid |
| --------------- | :-----: | :-----: | :------: |
| **Identity**    |         |         |          |
| SOUL.md         |   📒    |   🔒    |    🔒    |
| AGENTS.md       |   📒    |   🔒    |    🔒    |
| IDENTITY.md     |   📒    |   🔒    |    🔒    |
| USER.md         |   📒    |   🔒    |    🔒    |
| **Session**     |         |         |          |
| TOOLS.md        |   📒    |   🔒    |    🔒    |
| HEARTBEAT.md    |   📒    |   🔒    |    🔒    |
| BOOTSTRAP.md    |   📒    |   🔒    |    🔒    |
| **Memory**      |         |         |          |
| MEMORY.md       |   📒    |   📒    |    🔒    |
| memory/\*\*     |   📒    |   📒    |    🔒    |
| **Skills**      |         |         |          |
| skills/\*\*     |   📒    |   📒    |    🔒    |
| **Config**      |         |         |          |
| soulguard.json  |   🔒    |   🔒    |    🔒    |
| openclaw.json   |   📒    |   🔒    |    🔒    |
| cron/jobs.json  |   📒    |   🔒    |    🔒    |
| extensions/\*\* |   📒    |   🔒    |    🔒    |
| **Other**       |         |         |          |
| sessions/\*\*   |    —    |    —    |    📒    |

🔒 Vault (requires owner approval) · 📒 Ledger (tracked, agent writes freely) · — Unprotected

**Relaxed** — Onboarding mode. Only `soulguard.json` is locked. Everything else tracked.

**Default** — Steady state. Identity files and config locked. Memory and skills tracked.

**Paranoid** — Maximum lockdown. Everything vaulted except sessions.

## Plugin

The OpenClaw plugin integrates soulguard status into the agent's context and provides helpful guidance when vault writes fail.

### Current

- Reports soulguard status (vault/ledger health) in agent context
- Detects vault write failures and suggests staging workflow

### Planned

- `before_tool_call` hook to intercept vault writes and redirect to staging
- Native agent tools (`soulguard.propose`, `soulguard.status`, `soulguard.diff`)
- Cron job gating for vaulted cron configs
- Tool access control per configuration

## Why a Plugin?

Soulguard's core provides hard security via OS file permissions. The agent literally cannot write to vault files. But without the plugin, the agent sees raw `Permission denied` errors and may waste tokens retrying. The plugin:

1. Tells the agent _why_ the write failed
2. Guides it to edit `.soulguard/staging/` instead
3. Provides soulguard operations as native tools

The plugin adds zero security responsibility — if it has bugs, vault files are still protected by OS permissions.
