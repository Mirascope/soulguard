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
2. Framework plugin (UX layer — helpful errors, tool interception)

See [DESIGN.md](DESIGN.md) for the full threat model, architecture, and design decisions.

## Quick Start

```bash
# Install
npm install -g @soulguard/core

# Initialize workspace (requires sudo)
# Creates soulguardian user, soulguard group, sets up permissions
sudo soulguard init /path/to/workspace --agent-user <agent-username>

# Check status
sudo soulguard status /path/to/workspace

# Agent edits staging copies in .soulguard/staging/
# Then owner reviews and approves:
soulguard diff /path/to/workspace
sudo soulguard approve /path/to/workspace --hash <approval-hash>
```

## How It Works

### Init

`sudo soulguard init <workspace> --agent-user <user>`:

1. Creates `soulguard` group and `soulguardian` system user
2. Writes scoped sudoers rules (`/etc/sudoers.d/soulguard`)
3. Creates `.soulguard/staging/` with agent-writable copies of vault files
4. Sets vault file ownership to `soulguardian:soulguard 444`
5. Sets ledger file ownership to `<agent>:soulguard 644`
6. Commits initial state to git (if repo exists)

Init is idempotent — running it again skips completed steps.

### Implicit Proposals

There is no explicit `propose` command. The agent edits files in `.soulguard/staging/` directly. When the owner runs `diff`, soulguard compares staging against vault and computes an approval hash over all changes. The owner approves by passing this hash to `approve`.

```
Agent edits .soulguard/staging/SOUL.md
  ↓
Owner: soulguard diff .        → shows diff + approval hash
Owner: sudo soulguard approve . --hash <hash>  → applies changes
```

The hash covers all file diffs atomically — if anything changes between `diff` and `approve`, the hash won't match.

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

When the workspace is a git repo and `git` is not disabled in config:

- **`init`** commits all tracked files as an initial snapshot
- **`approve`** auto-commits vault changes after applying them
- **`commitLedgerFiles()`** — exported function for daemon/cove integration to commit ledger changes on their own schedule

All git commits use author `SoulGuardian <soulguardian@soulguard.ai>`. Git operations are best-effort — failures never block core operations. If the staging area has pre-existing staged changes, soulguard skips the commit to avoid absorbing unrelated work.

### Status & Sync

- `soulguard status` — reports vault and ledger file health (ownership, permissions, missing files)
- `soulguard sync` — fixes ownership/permission drift on vault and ledger files
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

## Packages

| Package                                   | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| [@soulguard/core](packages/core/)         | Vault, ledger, approval workflow, CLI, git integration   |
| [@soulguard/openclaw](packages/openclaw/) | OpenClaw framework plugin (templates, tool interception) |
| [@soulguard/web](packages/web/)           | Web-based approval UI (planned)                          |

## CLI Reference

**Requires sudo:**

- `sudo soulguard init <workspace> --agent-user <user>` — one-time setup
- `sudo soulguard approve <workspace> --hash <hash>` — apply staged changes
- `sudo soulguard sync <workspace>` — fix ownership/permission drift
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

_Built by [Mirascope](https://mirascope.com)._
