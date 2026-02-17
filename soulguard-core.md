# @soulguard/core

The soulguard daemon and CLI — vault enforcement, ledger tracking, proposal management, the socket API that approval channels connect to, and the command-line interface.

## What Core Does

- Owns and enforces vault file permissions
- Watches and records ledger file changes
- Manages proposals (create, approve, reject)
- Validates passwords (argon2)
- Maintains the changelog
- Exposes a Unix domain socket API
- Emits events for approval channels
- Runs as a system service (launchd/systemd)

## Daemon

The daemon runs as the `_soulguard` (macOS) or `soulguard` (Linux) system user. It's the only process that can:

- Write to vault files
- Read the password hash
- Modify soulguard.json

It communicates with the outside world exclusively through its socket API.

### Socket Location

```
/opt/soulguard/soulguard.sock
```

Permissions: the socket is readable/writable by the soulguard group. Approval channel processes must run as users in this group. The agent user has limited access (propose, diff, status, log — no approve/reject/revert without password).

### Starting the Daemon

The daemon is managed by the OS service manager:

```bash
# macOS
sudo launchctl load /Library/LaunchDaemons/ai.soulguard.daemon.plist

# Linux
sudo systemctl start soulguard
```

`soulguard init` installs the service automatically.

## Socket API

### Types

Example types (implementation may use multi-file proposals):

```typescript
interface Proposal {
  id: string
  workspacePath: string
  files: string[]         // files included in this proposal
  createdAt: string       // ISO 8601
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  resolvedAt?: string
  metadata?: Record<string, unknown>
}

interface ChangelogEntry {
  ts: string              // ISO 8601
  tier: 'vault' | 'ledger'
  action: string          // proposed, approved, rejected, withdrawn, changed
  proposal?: string       // proposal ID (for vault actions)
  file?: string           // single file (for ledger actions)
  files?: string[]        // multiple files (for vault proposals)
  hash?: string           // sha256 of file content
}

interface WorkspaceStatus {
  vaultFiles: string[]
  ledgerFiles: string[]
  pendingProposal: Proposal | null  // at most one
  needsSync: boolean      // config changed, need sudo sync
  daemonUptime: number
}

interface Result {
  ok: boolean
  error?: string
}
```

### Queries (no auth)

```typescript
// List pending proposals for a workspace
listProposals(workspacePath: string): Proposal[]

// Get a single proposal with full diff
getProposal(id: string): Proposal

// Workspace status
getStatus(workspacePath: string): WorkspaceStatus

// Changelog (paginated)
getChangelog(workspacePath: string, opts?: {
  since?: string       // ISO 8601
  until?: string
  tier?: 'vault' | 'ledger'
  file?: string
  limit?: number
}): ChangelogEntry[]

// List registered workspaces
listWorkspaces(): { path: string, name?: string }[]
```

### Mutations (password required)

```typescript
// Approve a vault proposal
approve(proposalId: string, password: string): Result

// Reject a vault proposal
reject(proposalId: string, password: string): Result

// Withdraw a proposal (agent can call without password)
withdraw(proposalId: string): Result
```

The daemon validates the password against the workspace's `.secret` hash before executing `approve` and `reject`. The `withdraw` operation can be called by the agent without a password.

### Events

```typescript
// Subscribe to real-time events
on('proposal:created', (proposal: Proposal) => void)
on('proposal:approved', (proposal: Proposal) => void)
on('proposal:rejected', (proposal: Proposal) => void)
on('proposal:withdrawn', (proposal: Proposal) => void)
on('ledger:changed', (entry: ChangelogEntry) => void)
```

Approval channels subscribe to events over the socket connection (e.g. WebSocket upgrade or streaming JSON over the Unix socket).

## File Watching (Ledger)

The daemon uses `chokidar` to watch ledger files. On change:

1. Compute sha256 of new content
2. Generate diff against previous version
3. Append entry to `changelog.jsonl`
4. Emit `ledger:changed` event
5. Store snapshot for future diffs

## Proposal Storage

Proposals are stored in `.soulguard/proposals/{pending,approved,rejected,withdrawn}/` as immutable snapshots:

```json
{
  "id": "p-20260216-001",
  "workspacePath": "/Users/aster/.openclaw/workspace",
  "file": "SOUL.md",
  "proposedContent": "...",
  "vaultHash": "sha256:abc123",
  "diff": "...",
  "createdAt": "2026-02-16T20:00:00Z",
  "status": "pending"
}
```

**Key properties:**

- `proposedContent` — exact content to write on approval (snapshot at propose-time)
- `vaultHash` — hash of vault file at propose-time (detects drift)
- `diff` — immutable diff for human review

On approval:

1. Validate password
2. Check that vault hash matches current file (detect concurrent changes)
3. Write `proposedContent` to vault file (as soulguard user)
4. Update proposal status to `approved`
5. Move proposal to `approved/` directory
6. Sync staging copy to match vault
7. Append to changelog
8. Emit `proposal:approved` event

If vault changed since proposal (hash mismatch), reject the approval and require agent to re-propose.

**Note: Needs to be atomic for proposals that may include multiple files.**

## Config Management

`soulguard.json` is itself a vault item (mode 444, readable by all, writable only by daemon). Changes go through the propose/approve flow via `soulguard config`:

```bash
# Add file to vault (creates proposal)
soulguard config add-vault MEMORY.md

# Approve the config change
soulguard approve p-003

# Apply ownership changes (requires sudo)
sudo soulguard sync
```

**Two-phase workflow:**

1. **Config change** — modifying `soulguard.json` via propose/approve (password-protected)
2. **Ownership sync** — applying file ownership changes via `sudo soulguard sync` (requires root)

The daemon cannot change file ownership (runs as `_soulguard`, not root), so ownership changes must be triggered explicitly by the user with sudo.

The daemon validates the config is parseable JSON before applying any change.

## Dependencies

- `argon2` — password hashing and validation
- `chokidar` — file system watching for ledger
- TypeScript, Node.js

No HTTP server — that's `@soulguard/web`. Core is the daemon, socket API, and CLI.

## CLI

The CLI is a thin client over the socket API. See the CLI reference in [DESIGN.md](../../DESIGN.md#cli-reference) for the full command list.
