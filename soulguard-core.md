# @soulguard/core

The soulguard daemon and CLI — vault enforcement,
ledger tracking, proposal management, the socket
API that approval channels connect to, and the
command-line interface.

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

The daemon runs as the `_soulguard` (macOS) or
`soulguard` (Linux) system user. It's the only
process that can:
- Write to vault files
- Read the password hash
- Modify soulguard.json

It communicates with the outside world exclusively
through its socket API.

### Socket Location

```
/opt/soulguard/soulguard.sock
```

Permissions: the socket is readable/writable by
the soulguard group. Approval channel processes
must run as users in this group. The agent user
has limited access (propose, diff, status, log —
no approve/reject/revert without password).

### Starting the Daemon

The daemon is managed by the OS service manager:

```bash
# macOS
sudo launchctl load /Library/LaunchDaemons/ai.soulguard.daemon.plist

# Linux
sudo systemctl start soulguard
```

`soulguard init` installs the service
automatically.

## Socket API

### Types

```typescript
interface Proposal {
  id: string
  workspacePath: string
  file: string
  diff: string
  createdAt: string       // ISO 8601
  status: 'pending' | 'approved' | 'rejected'
  metadata?: Record<string, unknown>
}

interface ChangelogEntry {
  ts: string              // ISO 8601
  tier: 'vault' | 'ledger'
  file: string
  action: string
  proposal?: string
  diff?: string
  hash: string            // sha256 of file content
}

interface WorkspaceStatus {
  vaultFiles: string[]
  ledgerFiles: string[]
  pendingProposals: number
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

// Revert a change (vault or ledger)
revert(changeId: string, password: string): Result
```

The daemon validates the password against the
workspace's `.secret` hash before executing any
mutation.

### Events

```typescript
// Subscribe to real-time events
on('proposal:created', (proposal: Proposal) => void)
on('proposal:approved', (proposal: Proposal) => void)
on('proposal:rejected', (proposal: Proposal) => void)
on('ledger:changed', (entry: ChangelogEntry) => void)
```

Approval channels subscribe to events over the
socket connection (e.g. WebSocket upgrade or
streaming JSON over the Unix socket).

## File Watching (Ledger)

The daemon uses `chokidar` to watch ledger files.
On change:
1. Compute sha256 of new content
2. Generate diff against previous version
3. Append entry to `changelog.jsonl`
4. Emit `ledger:changed` event
5. Store snapshot for future diffs

## Proposal Storage

Proposals live in `.soulguard/proposals/`:

```json
{
  "id": "p-20260216-001",
  "workspacePath": "/Users/aster/.openclaw/workspace",
  "file": "SOUL.md",
  "stagingContent": "...",
  "vaultContent": "...",
  "diff": "...",
  "createdAt": "2026-02-16T20:00:00Z",
  "status": "pending"
}
```

On approval:
1. Validate password
2. Write staging content to vault file
   (as soulguard user)
3. Update proposal status to `approved`
4. Sync staging copy to match vault
5. Append to changelog
6. Emit `proposal:approved` event

## Config Management

`soulguard.json` is itself a vault item (mode 444,
soulguard-owned). Changes go through the
propose/approve flow via `soulguard config`:

```bash
# Add file to vault (no password — promotion)
soulguard config add-vault MEMORY.md

# Move file from vault to ledger (requires password
# — demotion)
soulguard config demote MEMORY.md
```

The daemon validates the config is parseable JSON
before applying any change.

## Dependencies

- `argon2` — password hashing and validation
- `chokidar` — file system watching for ledger
- TypeScript, Node.js

No HTTP server — that's `@soulguard/web`.
Core is the daemon, socket API, and CLI.

## CLI

The CLI is a thin client over the socket API.
See the CLI reference in [DESIGN.md](../../DESIGN.md#cli-reference)
for the full command list.
