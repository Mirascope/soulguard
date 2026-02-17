# @soulguard/openclaw

OpenClaw framework plugin for soulguard. Provides
tool interception, helpful errors, cron gating, and
native agent tools.

For the core soulguard system, see
[@soulguard/core](../core/).

## Why a Plugin

Soulguard's core provides hard security via OS
file permissions. The agent literally cannot write
to vault files. But without the plugin, the agent
experience is poor:

- Agent tries to edit SOUL.md → raw EPERM error
- Agent doesn't understand why → retries, tries
  `chmod`, wastes tokens
- Non-file operations (cron, plugins) have no
  interception at the OS level

The plugin solves this while adding zero security
responsibility.

## Installation

Detected automatically during `soulguard init`
when OpenClaw is found:

```bash
sudo soulguard init ~/my-workspace
# Detects ~/.openclaw/openclaw.json
# → "OpenClaw detected. Install plugin? (Y/n)"
```

Manual install:
```bash
sudo soulguard install @soulguard/openclaw
```

## What It Does

### 1. File Write Interception

Hooks into OpenClaw's `before_tool_call` for
`write` and `edit` operations:

```
Agent: edit SOUL.md (add values section)

→ Plugin intercepts before write
→ Returns: "SOUL.md is soulguard-protected.
   Edit staging/SOUL.md instead, then run
   `soulguard propose`."
```

Optional auto-redirect mode: silently writes to
`staging/SOUL.md` and tells the agent the staging
copy was updated.

### 2. Cron Job Gating

OpenClaw stores cron jobs in
`~/.openclaw/cron/jobs.json`. The core soulguard
system protects this file (444). The plugin also
intercepts cron tool calls:

```
Agent: cron add { schedule: "every 1h", ... }

→ Plugin intercepts before execution
→ Creates soulguard proposal with job details
→ Returns: "Cron job proposed. Awaiting owner
   approval."
→ Owner approves → daemon executes cron add
   via gateway API
```

Same flow for `cron update` and `cron remove`.

The daemon needs localhost HTTP access to the
OpenClaw gateway API to execute approved cron
operations. The plugin provides the gateway
endpoint during init.

### 3. Plugin Installation Interception

Plugin installs modify `openclaw.json` (vaulted),
so they fail at the OS level. The plugin adds a
clear error instead of raw EPERM.

### 4. Native Agent Tools

Exposes soulguard as OpenClaw agent tools:

- **`soulguard.propose`** — submit vault proposal
- **`soulguard.diff`** — preview pending changes
- **`soulguard.status`** — check proposal state

### 5. AGENTS.md Injection

During init, appends to AGENTS.md:

```markdown
## Soulguard

Protected files are read-only. To propose changes:

1. Edit the file in staging/
2. Run `soulguard diff` to preview
3. Run `soulguard propose` to submit
4. Your human will review and approve

Cron job creation requires owner approval.
Memory logs and skills can be edited normally —
all changes are tracked.
```

This is injected into the agent's context window
every session.

## OpenClaw Paths Protected

The plugin extends `soulguard init` to protect
OpenClaw-specific paths:

| Path | What | Protection |
|------|------|-----------|
| `~/.openclaw/openclaw.json` | Gateway config | Vault (444) |
| `~/.openclaw/extensions/` | Global plugins | Protected (444) |
| `~/.openclaw/cron/jobs.json` | Scheduled jobs | Protected (444) |
| `<workspace>/.openclaw/extensions/` | Workspace plugins | Protected (444) |

### Why Each Path Matters

**`openclaw.json`** — channels, models, permissions,
plugin registry, safety settings. Any change could
compromise the agent.

**`extensions/`** — OpenClaw auto-loads `.ts` files
from these dirs at startup. A compromised agent
could drop a malicious extension, restart the
gateway, and the extension runs in-process.

**`cron/jobs.json`** — plain JSON the agent can
write to directly, bypassing the cron tool. Without
protection, a compromised agent writes a malicious
job and restarts the gateway.

## Bootstrap File Mapping

OpenClaw injects these files into the agent's
context window every session:

| File | Auto-injected | Default tier |
|------|:------------:|:------------:|
| SOUL.md | ✅ | Vault |
| AGENTS.md | ✅ | Vault |
| IDENTITY.md | ✅ | Vault |
| USER.md | ✅ | Vault |
| TOOLS.md | ✅ | Vault |
| HEARTBEAT.md | ✅ | Vault |
| MEMORY.md | ✅ | Vault |
| BOOT.md | ✅ | Vault |
| memory/*.md | ❌ on demand | Ledger |
| skills/ | ❌ on demand | Ledger |

Everything auto-injected → vault.
Everything on-demand → ledger.

## Plugin Configuration

In the workspace's `soulguard.json`:

```json
{
  "openclaw": {
    "protect_config": true,
    "protect_extensions": true,
    "protect_cron": true,
    "gate_cron_mutations": true,
    "auto_redirect_writes": false,
    "notify_on_gateway_restart": false,
    "gateway_api_port": 3000,
    "openclaw_config_path": null
  }
}
```

All protections on by default.
`auto_redirect_writes` silently redirects vault
writes to staging (off by default — explicit
errors are clearer for the agent).
`openclaw_config_path` overrides the default
`~/.openclaw/openclaw.json` path.

## No OpenClaw Code Changes Required

The plugin uses OpenClaw's existing extension
points:
- `before_tool_call` hooks for interception
- Plugin agent tools API
- Plugin config schema
- Standard discovery and installation
