# Soulguard Remote Approval Daemon — Design Notes

## Problem

Protected file changes require `sudo soulguard apply`, which means the human must be at the machine. If the agent is running unattended (e.g. on a Mac Mini), proposals sit waiting until the human returns.

Different teams also use different communication tools — Discord, Slack, WhatsApp, web dashboards — so the approval transport should be pluggable rather than hardcoded to a single platform.

## Solution

A channel-agnostic remote approval daemon that lives in `@soulguard/core`. The daemon polls for staging changes via `StateTree` hash comparison, manages proposal lifecycle, and delegates the actual notification + approval transport to an `ApprovalChannel` plugin. Discord is the first channel implementation, packaged as `@soulguard/discord`.

## Architecture

```
Agent process (uid=agent_a)
│
│  soulguard stage SOUL.md
│  echo "..." > .soulguard-staging/SOUL.md
│

Daemon process (uid=soulguardian_agent_a)        [@soulguard/core daemon]
│
│  ProposalManager ─── polls StateTree hash, debounces, manages lifecycle
│     │
│     ├── ApprovalChannel.postProposal({ files, hash })
│     ├── ApprovalChannel.waitForApproval(id, signal)
│     │      ← human approves via channel
│     ├── apply(tree, hash)
│     └── ApprovalChannel.postResult(id, "applied")
│
└── ApprovalChannel interface (pluggable)
     ├── DiscordChannel    (@soulguard/discord)
     └── ...
```

### Key design decisions

- **Runs as soulguardian\_\<agent\>** — the daemon doesn't need sudo, it already has write access to protected files as the guardian user
- **Systemd/launchd service** — `soulguard init` installs a systemd unit (Linux) or launchd plist (macOS) per agent
- **StateTree hash polling** — polls `StateTree.build()` to compute an approval hash, compares against the last proposed hash to detect changes. No filesystem watcher or IPC needed.
- **Channel-agnostic core** — all polling and lifecycle logic lives in `@soulguard/core`. Channel plugins only handle transport.

### Proposal Manager

The `ProposalManager` is the single component that handles both change detection and proposal lifecycle:

**Change detection** — Polls `StateTree.build()` at a fixed interval (default 2s) and compares the resulting `approvalHash` against the last proposed hash. When a new hash is detected, a proposal is created immediately. While a proposal is in flight (being posted to the channel or awaiting approval), new polls are suppressed to prevent duplicate proposals.

**Proposal lifecycle** — State machine for each proposal:

```
              ┌─── approved   ──→ apply(tree, hash) ──→ postResult("applied")
              │
pending ──────┤─── rejected   ──→ postResult("rejected")
              │
              └─── superseded ──→ postResult("superseded")
```

- Builds a `StateTree` snapshot + computes diff and approval hash at proposal creation time
- On approval: re-builds a fresh `StateTree`, verifies the hash hasn't drifted, then calls `apply()`. If the hash changed between proposal and approval, the proposal is rejected.
- Only one proposal is active at a time. New staging changes while a proposal is pending supersede it (abort the old `waitForApproval` via `AbortSignal`, create new) — this is the natural staleness mechanism, no wall-clock timeout needed.

### ApprovalChannel interface

```typescript
interface ApprovalChannel {
  readonly name: string;

  postProposal(proposal: ProposalPayload): Promise<PostProposalResult>;

  waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult>;

  postResult(proposalId: string, result: ProposalOutcome): Promise<PostResultOutcome>;

  dispose(): Promise<void>;
}
```

- **`postProposal`** — The channel posts the proposal (per-file diffs + hash) to its platform and returns a channel-specific ID (e.g., Discord message ID). The daemon tracks this.
- **`waitForApproval`** — Long-lived. Can block (polling) or use events (websocket/webhook). Accepts an `AbortSignal` for cancellation on supersession. The interface is agnostic to the mechanism.
- **`postResult`** — Best-effort confirmation. If posting fails, the apply/reject has already happened.
- **`dispose`** — Cleanup: close connections, stop listeners.

### Channel registration

Channel plugins are registered at process startup via `registerChannel(name, factory)`. The registry uses `globalThis` because `@soulguard/core` ships as two bundles (`index.js` and `cli/cli.js`) that don't share module-level state. The `soulguard` meta-package's entry point ([bin/soulguard.js](../packages/soulguard/bin/soulguard.js)) registers channels before dynamically importing the CLI.

## Config

All daemon and channel config lives in `soulguard.json` under a `"daemon"` key, matching the existing convention of a single config file:

```json
{
  "version": 1,
  "guardian": "soulguardian_myagent",
  "files": {
    "soulguard.json": "protect",
    "SOUL.md": "protect",
    "MEMORY.md": "watch"
  },
  "git": true,
  "daemon": {
    "channel": "discord",
    "discord": {
      "botToken": "...",
      "channelId": "123456789",
      "approverUserIds": ["111111111", "222222222"]
    }
  }
}
```

- **`daemon.channel`** — Which `ApprovalChannel` implementation to use
- **`daemon.<channel>`** — Channel-specific config block. Core validates daemon-level fields and passes through the channel block without interpretation.

`soulguard.json` is always protected — the agent can't tamper with daemon or channel config.

## Discord channel

`@soulguard/discord` is the first `ApprovalChannel` implementation, using Discord.js.

### How it implements the interface

- **`postProposal`** — Sends an embed to the configured channel with per-file diffs (as code-fenced diff blocks), file status labels, and the hash in the footer. Seeds the message with ✅ and ❌ reactions. Returns the Discord message ID. If the proposal exceeds Discord's embed limits (>25 files, diff too long, or total >6000 chars), posts a red "Proposal Too Large" embed instead and auto-rejects it.
- **`waitForApproval`** — Listens for `messageReactionAdd` events. Filters by: correct message ID, not the bot itself, user ID in `approverUserIds`, and emoji is ✅ or ❌. Before resolving, performs defense-in-depth checks (edit detection + content verification). Respects the `AbortSignal` for supersession.
- **`postResult`** — Edits the original embed to update title and color (green "Applied", red "Rejected", yellow "Superseded").
- **`dispose`** — Clears tracked proposals, destroys the Discord client.

### Security model

#### Trust anchor

The human's Discord user ID. Discord's auth model guarantees a bot token can only act _as the bot_, never _as a human user_. The agent cannot forge a reaction from an approved human.

#### Primary defense: content verification at approval time

When the human reacts to approve, the channel implementation verifies the message embed content matches the tracked proposal payload (footer hash matches, field count matches file count). If they don't match — whether due to editing, message replacement, or state drift — the approval is rejected.

The `ProposalManager` additionally re-builds a fresh `StateTree` on approval and verifies the `approvalHash` still matches the proposal's hash before calling `apply()`. This catches staging changes between proposal and approval.

#### Defense in depth: edit detection

As an early warning, the channel checks `edited_timestamp != null` on the proposal message. If edited, the proposal is immediately invalidated with a visible warning ("⚠️ Proposal message was edited — approval invalidated") — catching tampering _before_ the human reacts, which is better UX than a silent rejection after approval.

#### Reconnect behavior

If the channel connection drops and reconnects, the daemon locates its existing proposal message (by tracked message ID) and verifies the content still matches the current state tree. If it matches, it resumes waiting for approval. If the message is missing or content doesn't match, it supersedes and posts a fresh proposal.

#### Threat: agent deletes message and posts a lookalike

**Defense:** The channel implementation tracks its own message ID. Only accepts reactions on that specific message. Additionally, content verification at approval time ensures any replacement message would need to contain the exact canonical diff — which the agent cannot forge without knowing the correct staging state (which it does know, but cannot produce a diff that misrepresents the contents while matching the hash).

#### Threat: agent reacts with ✅ itself

**Defense:** Filter reactions by user ID. Only `approverUserIds` are accepted. The bot's own user ID is always excluded.

#### Threat: agent spams staging to fatigue the human

**Mitigations:**

- Only the most recent proposal is active (daemon-level — new staging changes supersede the old proposal)
- Discord-specific: could require the bot to be the sole poster in a dedicated channel

#### Hash provides defense in depth

Even if all UX-level checks were bypassed, the `--hash` flag on `soulguard apply` ensures the staging tree hasn't been modified between review and apply. The hash is a SHA-256 over the actual staged file contents. This is an `apply()` guarantee from `@soulguard/core`, not Discord-specific — but worth restating here.

## Per-agent guardian

**Status: implemented**

The daemon requires per-agent soulguardian users (`soulguardian_agent_a`, `soulguardian_agent_b`) so that:

- Each daemon process can only access its own workspace's protected files
- Each daemon has its own channel config in `soulguard.json`
- OS permissions enforce the boundary between agents

The group `soulguard` stays shared (only used for read access).

## Adding future channels

To add a new approval channel (e.g., Slack):

1. Create a new package (e.g., `@soulguard/slack`)
2. Implement the `ApprovalChannel` interface
3. Register it via `registerChannel("slack", createChannel)` in the meta-package entry point
4. Define the channel-specific config shape (validated by the channel, not core)
5. Document channel-specific security considerations — each transport has its own threat model
6. Users set `"channel": "slack"` in their `soulguard.json` daemon config and add the `"slack": { ... }` block

For example, a Slack implementation might use thread-based approval (proposal posted as a message, approve/reject via thread reply or emoji), with trust anchored to Slack workspace membership + user IDs.

## Decisions

- **Multiple simultaneous channels** — Not in initial scope. Fine to add later, but not a pressing concern.
- **Fallback when remote channel is unreachable** — The fallback is the existing `sudo soulguard apply` CLI workflow. The daemon is additive, not a replacement.
- **Multi-party approval (N of M)** — Not in initial scope.
- **Channel plugin discovery** — Registration-based. The `soulguard` meta-package registers channels at startup via `registerChannel()`. The registry uses `globalThis` for cross-bundle sharing. The `soulguard` meta-package bundles Discord as a default dependency so it works out of the box.

## Future work

- **`sudo soulguard review <hash>`** — CLI command to review proposals that exceed channel display limits (e.g. Discord's embed size). This would be more convenient than running `soulguard diff` and `sudo soulguard apply`.

## Open questions

- **Secret management for bot tokens** — Currently stored as plaintext in `soulguard.json` (which is protected). Future consideration: support env var references or OS keychain integration for channel secrets.
