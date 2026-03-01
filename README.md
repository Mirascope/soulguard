# Soulguard

_Identity protection for AI agents._

Soulguard protects AI agent identity files from prompt injection attacks using OS-level file permissions as the hard security floor. It provides two protection tiers — **protect** (locked, requires owner approval) and **watch** (tracked, agent writes freely) — with optional framework plugins for better UX.

## The Problem

AI agents read identity files (SOUL.md, AGENTS.md, config) on every session. If a prompt injection compromises the agent, it can rewrite these files — persistently changing the agent's personality, values, and behavior across all future sessions.

## The Approach

**Two tiers:**

- **Protect 🔒** — Protected files are owned by a system user with mode 444 (read-only). The agent cannot modify them — OS permissions enforce this. To change a protect-tier file, the agent edits a staging copy; the owner reviews the diff and approves.

- **Watch 📒** — Files the agent may modify freely, but ownership and permissions are tracked. Drift (wrong ownership/mode) is detected and auto-fixed by `sync`.

**Two enforcement layers:**

1. OS file permissions (hard floor — works without any framework integration)
2. Framework plugin (UX layer — intercepts tool calls, provides helpful errors, redirects writes to staging)

See [DESIGN.md](DESIGN.md) for the full threat model, architecture, and design decisions.

## Quick Start

```bash
# Install
npm install -g soulguard

# Initialize (requires sudo) — point at the OpenClaw home directory
sudo soulguard init ~/.openclaw

# Check status
soulguard status ~/.openclaw

# Agent edits staging copies in .soulguard/staging/
# Then owner reviews and approves:
soulguard diff ~/.openclaw
sudo soulguard apply ~/.openclaw
```

## How It Works

### Init

`sudo soulguard init <workspace>`:

1. Creates `soulguard` group (if not already created) and `soulguardian` system user (if not already present)
2. Writes scoped sudoers rules (`/etc/sudoers.d/soulguard`)
3. Creates `.soulguard/staging/` with agent-writable copies of protect-tier files
4. Sets protect-tier file ownership to `soulguardian:soulguard 444`
5. Sets watch-tier file ownership to `<agent>:soulguard 644`
6. Initializes a git repo if one doesn't exist, and commits initial state (both protect and watch files)

Init is idempotent — running it again skips completed steps.

### Approval Workflow

The agent edits files in `.soulguard/staging/` directly. When the owner runs `diff`, soulguard compares staging against protect-tier and shows a unified diff of all changes. The owner then runs `apply` to review and apply:

```
Agent edits .soulguard/staging/SOUL.md
  ↓
Owner: soulguard diff .        → shows what changed
Owner: sudo soulguard apply .  → reviews and applies changes
```

Approve computes a hash over all diffs and applies changes atomically. If anything changes between diff and approve, the hashes won't match and approve will reject.

### File Deletion

Protect-tier files can be deleted through the staging workflow. If an agent removes a file from `.soulguard/staging/`, `diff` shows it as deleted and includes it in the apply hash. On approve, the protect-tier copy is removed.

`soulguard.json` itself cannot be deleted (self-protection).

### Glob Patterns

Protect and watch lists in `soulguard.json` support glob patterns:

```json
{
  "version": 1,
  "protect": ["soulguard.json", "*.md"],
  "watch": ["memory/*.md", "skills/**/*.md"]
}
```

Globs are resolved to concrete file paths at runtime. All commands (status, diff, sync, approve, reset) resolve globs before operating.

### Git Integration

When the workspace has a git repo and `git` is not disabled in config:

- **`init`** creates a git repo if needed, then commits all tracked files (protect + watch) as an initial snapshot
- **`apply`** auto-commits protect-tier changes after applying them
- **`sync`** commits all tracked files (protect + watch) after fixing drift

All git commits use author `SoulGuardian <soulguardian@soulguard.ai>`. Git operations are best-effort — failures never block core operations. If the staging area has pre-existing staged changes, soulguard skips the commit to avoid absorbing unrelated work.

### Status & Sync

- `soulguard status` — reports protect and watch file health (ownership, permissions, missing files)
- `soulguard sync` — fixes ownership/permission drift on protect and watch files, then commits all tracked files to git
- `soulguard reset` — resets staging to match current protect-tier state

## Configuration

`soulguard.json` in the workspace root:

```json
{
  "version": 1,
  "protect": ["soulguard.json", "SOUL.md", "AGENTS.md", "IDENTITY.md"],
  "watch": ["MEMORY.md", "memory/*.md"],
  "git": true
}
```

- **`protect`** — files/globs that require owner approval to modify (mode 444)
- **`watch`** — files/globs with tracked ownership (mode 644, agent-writable)
- **`git`** — enable/disable auto-commits (default: true if not specified)

`soulguard.json` is always implicitly protected (self-protection).

### Protection Templates

The OpenClaw plugin (`@soulguard/openclaw`) ships three templates that categorize all known workspace paths:

- **default** — core identity and config in protect, memory and skills in watch
- **paranoid** — everything possible in protect, only sessions unprotected
- **relaxed** — only `soulguard.json` locked, everything else in watch in watch

## Packages

| Package                                   | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| [@soulguard/core](packages/core/)         | Protect, watch, apply workflow, CLI, git integration     |
| [@soulguard/openclaw](packages/openclaw/) | OpenClaw framework plugin (templates, tool interception) |
| [soulguard](packages/soulguard/)          | Meta-package — installs core + CLI                       |

## CLI Reference

**Requires sudo:**

- `sudo soulguard init <dir>` — one-time setup
- `sudo soulguard apply <dir>` — apply staged changes
- `sudo soulguard sync <dir>` — fix ownership/permission drift + commit
- `sudo soulguard reset <dir>` — reset staging to match protect tier

**No sudo required:**

- `soulguard status <dir>` — protect and watch health
- `soulguard diff <dir>` — show pending changes + apply hash

For OpenClaw agents, `<dir>` is the OpenClaw home directory (e.g. `~/.openclaw/`), which contains both framework config (`openclaw.json`, `cron/`) and the agent workspace (`workspace/`).

## Links

- **Design doc:** [DESIGN.md](DESIGN.md)
- **Website:** [soulguard.ai](https://soulguard.ai)
- **GitHub:** [mirascope/soulguard](https://github.com/mirascope/soulguard)

## License

MIT

---

_Built with ❤️ for 🦞 by [Chelae](https://chelae.com)._
