# @soulguard/openclaw

OpenClaw framework plugin for Soulguard. Provides tool interception, helpful errors, cron gating, and configuration templates.

For the core system, see [@soulguard/core](../core/).

## Templates

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

**Relaxed** — Onboarding mode. Only `soulguard.json` is locked. Agent can freely modify config, add channels, tweak cron. Everything tracked.

**Default** — Steady state. Identity files and attack surfaces locked. Memory and skills tracked in ledger.

**Paranoid** — Maximum lockdown. Everything vaulted except sessions. Skills require approval too (skill injection is a real attack vector).

## Why a Plugin

Soulguard's core provides hard security via OS file permissions. The agent literally cannot write to vault files. But without the plugin, the agent experience is poor:

- Agent tries to edit SOUL.md → raw EPERM error
- Agent doesn't understand why → retries, tries `chmod`, wastes tokens
- Non-file operations (cron, plugins) have no interception at the OS level

The plugin solves this while adding zero security responsibility.

## What It Does

### 1. File Write Interception

Hooks into OpenClaw's `before_tool_call` for `write` and `edit` operations:

```
Agent: edit SOUL.md (add values section)
→ Plugin intercepts
→ "SOUL.md is soulguard-protected. Edit staging/SOUL.md instead,
   then run `soulguard propose`."
```

### 2. Cron Job Gating

Intercepts `cron` tool calls for vaulted cron configs:

```
Agent: cron add { schedule: "every 1h", ... }
→ Plugin intercepts
→ Creates soulguard proposal
→ "Cron job proposed. Awaiting owner approval."
```

### 3. Native Agent Tools

Exposes soulguard operations as agent tools:

- **`soulguard.propose`** — create or update vault proposal
- **`soulguard.withdraw`** — withdraw pending proposal
- **`soulguard.diff`** — preview pending changes
- **`soulguard.status`** — check workspace state and proposals

### 4. Tool Access Control

The plugin can restrict tool access per configuration — useful for hosted service tiers:

```json
{
  "exec_policy": {
    "allowed": ["ls", "cat", "head", "tail", "find", "grep"],
    "denied": ["*"]
  }
}
```

## No OpenClaw Code Changes Required

Uses OpenClaw's existing extension points:

- `before_tool_call` hooks (`{ block: true, blockReason: "..." }`)
- Plugin agent tools API
- Standard discovery and installation
