# Soulguard Remote Approval Daemon — Design Notes

## Problem

Protected file changes require `sudo soulguard apply`, which means the human must be at the machine. If the agent is running unattended (e.g. on a Mac Mini), proposals sit waiting until the human returns.

Different teams also use different communication tools — Discord, Slack, WhatsApp, web dashboards — so the approval transport should be pluggable rather than hardcoded to a single platform.

## Solution

A channel-agnostic remote approval daemon that lives in `@soulguard/core`. The daemon watches `.soulguard-staging/` for changes, manages proposal lifecycle, and delegates the actual notification + approval transport to an `ApprovalChannel` plugin. Discord is the first channel implementation, packaged as `@soulguard/discord`.

## Architecture

```
Agent process (uid=agent_a)
│
│  soulguard stage SOUL.md
│  echo "..." > .soulguard-staging/SOUL.md
│

Daemon process (uid=soulguardian_agent_a)        [@soulguard/core daemon]
│
│  Watcher ─── polls .soulguard-staging/ for changes
│  Proposal Manager ─── state machine, consumes diff() + apply()
│     │
│     ├── ApprovalChannel.postProposal(diff, hash)
│     ├── ApprovalChannel.waitForApproval(id)
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
- **Systemd service** — `soulguard init` installs a systemd unit per agent
- **Filesystem polling** — watches `.soulguard-staging/` for changes, no IPC needed between agent and daemon
- **Channel-agnostic core** — all polling and lifecycle logic lives in `@soulguard/core`. Channel plugins only handle transport.

### Core daemon

The daemon has two components:

**Watcher** — Polls `.soulguard-staging/` at a fixed interval. When a change is detected (new, modified, or removed staging entries), it waits for a configurable debounce period (default 3s) after the last write before creating a proposal. This handles the common case where agents stage multiple files in rapid succession.

**Proposal Manager** — State machine for proposal lifecycle:

```
              ┌─── approved   ──→ apply(tree, hash) ──→ postResult("applied")
              │
pending ──────┤─── rejected   ──→ postResult("rejected")
              │
              └─── superseded ──→ postResult("superseded")
```

- Builds a `StateTree` snapshot + computes diff and approval hash at proposal creation time
- On approval: calls `apply()` with the snapshotted tree and hash
- Only one proposal is active at a time. New staging changes while a proposal is pending supersede it (cancel old, create new) — this is the natural staleness mechanism, no wall-clock timeout needed.

### ApprovalChannel interface

```typescript
interface ApprovalChannel {
  postProposal(proposal: { diff: string; hash: string; description?: string }): Promise<string>; // returns channel-specific proposal ID

  waitForApproval(proposalId: string): Promise<{
    approved: boolean;
    approver: string;
  }>;

  postResult(proposalId: string, result: "applied" | "rejected" | "superseded"): Promise<void>;

  dispose(): Promise<void>;
}
```

- **`postProposal`** — The channel posts the diff to its platform and returns a channel-specific ID (e.g., Discord message ID, Slack message timestamp). The daemon tracks this.
- **`waitForApproval`** — Long-lived. Can block (polling) or use events (websocket/webhook). The interface is agnostic to the mechanism.
- **`postResult`** — Best-effort confirmation. If posting fails, the apply/reject has already happened.
- **`dispose`** — Cleanup: close connections, stop listeners.

### Agent-provided description

The agent can write a description to `.soulguard-staging/.description`. The daemon reads this and passes it as `description` in the `postProposal` call. How it's displayed is up to the channel implementation. This is purely informational — the hash is what matters for security.

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
    "debounceMs": 3000,
    "discord": {
      "botToken": "...",
      "channelId": "123456789",
      "approverUserIds": ["111111111", "222222222"]
    }
  }
}
```

- **`daemon.channel`** — Which `ApprovalChannel` implementation to use
- **`daemon.debounceMs`** — Wait this long after the last staging write before creating a proposal
- **`daemon.<channel>`** — Channel-specific config block. Core validates daemon-level fields and passes through the channel block without interpretation.

`soulguard.json` is always protected — the agent can't tamper with daemon or channel config.

## Discord channel

`@soulguard/discord` is the first `ApprovalChannel` implementation, using Discord.js.

### How it implements the interface

- **`postProposal`** — Sends an embed to the configured channel with the diff summary, hash, and optional description. Returns the Discord message ID.
- **`waitForApproval`** — Listens for emoji reactions (✅ / ❌) on the proposal message from approved user IDs.
- **`postResult`** — Edits the original message or posts a follow-up with the outcome.
- **`dispose`** — Disconnects the Discord client.

### Security model

#### Trust anchor

The human's Discord user ID. Discord's auth model guarantees a bot token can only act _as the bot_, never _as a human user_. The agent cannot forge a reaction from an approved human.

#### Threat: agent edits the proposal message

1. Plugin posts: "Agent proposes `<evil diff>` — hash: `abc123`"
2. Agent (which has the bot token) edits message to: "Agent proposes `<innocent diff>` — hash: `abc123`"
3. Human reads innocent description, approves
4. Plugin applies the evil hash

**Defense:** At reaction time, check `edited_timestamp != null` on the message. If edited, reject and post a warning. The hash alone doesn't prevent this because the human trusts the message text, not the opaque hash.

#### Threat: agent deletes message and posts a lookalike

**Defense:** The channel implementation tracks its own message ID. Only accepts reactions on that specific message. If the message is gone, something is wrong — reject.

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
3. Define the channel-specific config shape (validated by the channel, not core)
4. Document channel-specific security considerations — each transport has its own threat model
5. Users set `"channel": "slack"` in their `soulguard.json` daemon config and add the `"slack": { ... }` block

For example, a Slack implementation might use thread-based approval (proposal posted as a message, approve/reject via thread reply or emoji), with trust anchored to Slack workspace membership + user IDs.

## Decisions

- **Multiple simultaneous channels** — Not in initial scope. Fine to add later, but not a pressing concern.
- **Fallback when remote channel is unreachable** — The fallback is the existing `sudo soulguard apply` CLI workflow. The daemon is additive, not a replacement.
- **Multi-party approval (N of M)** — Not in initial scope.
- **Channel plugin discovery** — Convention-based dynamic import. The daemon resolves `"channel": "discord"` to `@soulguard/discord` via dynamic `import()`. The imported module must export a `createChannel(config)` function that returns an `ApprovalChannel`. If the package isn't installed, the daemon fails with a helpful message ("install @soulguard/discord to use the discord channel"). The `soulguard` meta-package bundles Discord as a default dependency so it works out of the box.

## Open questions

None currently.
