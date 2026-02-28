# Soulguard

_Identity protection for AI agents._

Soulguard protects AI agent identity files from prompt injection attacks using OS-level file permissions as the hard security floor. It provides two protection tiers — **vault** (locked, requires owner approval) and **ledger** (tracked, agent writes freely) — with optional framework plugins for better UX.

## The Problem

AI agents read identity files (SOUL.md, AGENTS.md, config) on every session. If a prompt injection compromises the agent, it can rewrite these files — persistently changing the agent's personality, values, and behavior across all future sessions.

## The Approach

**Two tiers:**

- **Vault 🔒** — Vaulted files are owned by a system user with mode 444 (read-only). The agent cannot modify them — OS permissions enforce this. To change a vault file, the agent edits a staging copy; the owner reviews the diff and approves.

- **Ledger 📒** — Files the agent may modify freely, but ownership and permissions are tracked. Drift (wrong ownership/mode) is detected and auto-fixed by `sync`.

**Two enforcement layers:**

1. OS file permissions (hard floor — works without any framework integration)
2. Framework plugin (UX layer — intercepts tool calls, provides helpful errors, redirects writes to staging)

See [DESIGN.md](DESIGN.md) for the full threat model, architecture, and design decisions.

## Quick Start

```bash
# Install
npm install -g soulguard

# Initialize workspace (requires sudo)
sudo soulguard init /path/to/workspace

# Check status
soulguard status /path/to/workspace

# Agent edits staging copies in .soulguard/staging/
# Then owner reviews and approves:
soulguard diff /path/to/workspace
sudo soulguard approve /path/to/workspace
```

## How It Works

### Init

`sudo soulguard init <workspace>`:

1. Creates `soulguard` group (if not already created) and `soulguardian` system user (if not already present)
2. Writes scoped sudoers rules (`/etc/sudoers.d/soulguard`)
3. Creates `.soulguard/staging/` with agent-writable copies of vault files
4. Sets vault file ownership to `soulguardian:soulguard 444`
5. Sets ledger file ownership to `<agent>:soulguard 644`
6. Initializes a git repo if one doesn't exist, and commits initial state (both vault and ledger files)

Init is idempotent — running it again skips completed steps.

### Approval Workflow

The agent edits files in `.soulguard/staging/` directly. When the owner runs `diff`, soulguard compares staging against vault and shows a unified diff of all changes. The owner then runs `approve` to review and apply:

```
Agent edits .soulguard/staging/SOUL.md
  ↓
Owner: soulguard diff .        → shows what changed
Owner: sudo soulguard approve .  → reviews and applies changes
```

Approve computes a hash over all diffs and applies changes atomically. If anything changes between diff and approve, the hashes won't match and approve will reject.

### File Deletion

Vault files can be deleted through the staging workflow. If an agent removes a file from `.soulguard/staging/`, `diff` shows it as deleted and includes it in the approval hash. On approve, the vault copy is removed.

`soulguard.json` itself cannot be deleted (self-protection).

### Glob Patterns

Vault and ledger lists in `soulguard.json` support glob patterns:

```json
{
  "vault": ["soulguard.json", "*.md"],
  "ledger": ["memory/*.md", "skills/**/*.md"]
}
```

Globs are resolved to concrete file paths at runtime. All commands (status, diff, sync, approve, reset) resolve globs before operating.

### Git Integration

When the workspace has a git repo and `git` is not disabled in config:

- **`init`** creates a git repo if needed, then commits all tracked files (vault + ledger) as an initial snapshot
- **`approve`** auto-commits vault changes after applying them
- **`sync`** commits all tracked files (vault + ledger) after fixing drift

All git commits use author `SoulGuardian <soulguardian@soulguard.ai>`. Git operations are best-effort — failures never block core operations. If the staging area has pre-existing staged changes, soulguard skips the commit to avoid absorbing unrelated work.

### Status & Sync

- `soulguard status` — reports vault and ledger file health (ownership, permissions, missing files)
- `soulguard sync` — fixes ownership/permission drift on vault and ledger files, then commits all tracked files to git
- `soulguard reset` — resets staging to match current vault state

## Configuration

`soulguard.json` in the workspace root:

```json
{
  "vault": ["soulguard.json", "SOUL.md", "AGENTS.md", "IDENTITY.md"],
  "ledger": ["MEMORY.md", "memory/*.md"],
  "git": true
}
```

- **`vault`** — files/globs that require owner approval to modify (mode 444)
- **`ledger`** — files/globs with tracked ownership (mode 644, agent-writable)
- **`git`** — enable/disable auto-commits (default: true if not specified)

`soulguard.json` is always implicitly vaulted (self-protection).

### Protection Templates

The OpenClaw plugin (`@soulguard/openclaw`) ships three templates that categorize all known workspace paths:

- **default** — core identity and config in vault, memory and skills in ledger
- **paranoid** — everything possible in vault, only sessions unprotected
- **relaxed** — only `soulguard.json` locked, everything else tracked in ledger

## Packages

| Package                                   | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| [@soulguard/core](packages/core/)         | Vault, ledger, approval workflow, CLI, git integration   |
| [@soulguard/openclaw](packages/openclaw/) | OpenClaw framework plugin (templates, tool interception) |
| [soulguard](packages/soulguard/)          | Meta-package — installs core + CLI                       |

## CLI Reference

**Requires sudo:**

- `sudo soulguard init <workspace>` — one-time setup
- `sudo soulguard approve <workspace>` — apply staged changes
- `sudo soulguard sync <workspace>` — fix ownership/permission drift + commit
- `sudo soulguard reset <workspace>` — reset staging to match vault

**No sudo required:**

- `soulguard status <workspace>` — vault and ledger health
- `soulguard diff <workspace>` — show pending changes + approval hash

## Links

- **Design doc:** [DESIGN.md](DESIGN.md)
- **Website:** [soulguard.ai](https://soulguard.ai)
- **GitHub:** [mirascope/soulguard](https://github.com/mirascope/soulguard)

## License

MIT

---

_Built with ❤️ for 🦞 by [Chelae](https://chelae.com)._
