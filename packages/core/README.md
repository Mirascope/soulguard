# @soulguard/core

Vault enforcement, ledger tracking, approval workflow, git integration, and CLI for soulguard.

## What Core Does

- Enforces vault file permissions (444, soulguardian-owned)
- Tracks ledger file ownership/permissions
- Manages implicit proposals (staging → diff → approve)
- Handles vault file deletion through staging
- Resolves glob patterns in vault/ledger config
- Auto-commits vault and ledger changes to git
- Self-protection (soulguard.json cannot be deleted or corrupted)

## Library API

Core exports functions for programmatic use (e.g. by `@soulguard/openclaw` or daemon/cove integration):

```typescript
import {
  init,
  status,
  sync,
  diff,
  approve,
  reset,
  commitLedgerFiles,
  gitCommit,
  isGitEnabled,
  isVaultedFile,
  isGlob,
  resolvePatterns,
} from "@soulguard/core";
```

### Key Functions

**`init(options)`** — One-time workspace setup. Creates system user/group, sets file permissions, generates sudoers, initializes staging, commits to git.

**`status(options)`** — Returns vault and ledger file health (ok, drifted, missing, error).

**`sync(options)`** — Fixes ownership/permission drift on vault and ledger files.

**`diff(options)`** — Compares staging against vault. Returns per-file diffs and an approval hash.

**`approve(options)`** — Applies staged changes to vault files. Validates approval hash, handles deletions, auto-commits to git.

**`reset(options)`** — Resets staging copies to match current vault state.

**`commitLedgerFiles(ops, config)`** — Standalone git commit for ledger files. Exported for daemon/cove to call on their own schedule (not part of `sync`).

### Types

```typescript
// Status result per file
type FileStatus =
  | { status: "ok"; file: TrackedFile }
  | { status: "drifted"; file: TrackedFile; issues: DriftIssue[] }
  | { status: "missing"; path: string }
  | { status: "error"; path: string; error: IOError };

// Diff result per file
type FileDiff =
  | { status: "modified"; path: string; diff: string; protectedHash: string; stagedHash: string }
  | { status: "unchanged"; path: string }
  | { status: "missing_staging"; path: string }
  | { status: "deleted"; path: string; protectedHash: string };

// Git commit result (discriminated union)
type GitCommitResult =
  | { committed: true; message: string; files: string[] }
  | { committed: false; reason: "git_disabled" | "no_files" | "nothing_staged" | "dirty_staging" };
```

## CLI

The CLI is the primary user interface. All commands take a workspace path as the first argument.

```bash
# Setup
sudo soulguard init /workspace --agent-user agent

# Check health
soulguard status /workspace
sudo soulguard sync /workspace

# Review and approve changes
soulguard diff /workspace
sudo soulguard approve /workspace --hash <hash>

# Reset staging
sudo soulguard reset /workspace
```

See [DESIGN.md](../../DESIGN.md#cli-reference) for the full command reference.

## System Operations

Core uses a `SystemOperations` interface for all filesystem and OS interactions. This enables:

- **`NodeSystemOps`** — real filesystem operations for production
- **`MockSystemOps`** — in-memory mock for unit testing

The mock tracks all operations as a recorded log, supports glob matching, and allows configuring failures for error path testing.

## Testing

```bash
# Unit tests (135 tests)
bun test packages/core/src/

# E2e tests (20 tests, requires Docker)
bash packages/core/test-e2e/run-tests.sh

# Update e2e snapshots
bash packages/core/test-e2e/run-tests.sh --update
```

E2e tests run each case in an isolated Docker container with real OS users, file permissions, and sudo — testing the actual security boundary.

## Dependencies

- TypeScript, Node.js 22+ (for `fs.glob`)
- `commander` — CLI framework
- `diff` — unified diff generation

No daemon, no HTTP server, no file watching. Core is a library + CLI.
