# Task 5: @soulguard/discord Channel Implementation

## Goal

First ApprovalChannel implementation. Uses Discord.js to post proposals
as embeds, listen for emoji reactions from approved users, and report
outcomes. Implements the security model from the design doc.

## Files to create/modify

### New files (new package: `packages/discord/`)

- `packages/discord/package.json`
- `packages/discord/tsconfig.json`
- `packages/discord/src/index.ts` — exports createChannel
- `packages/discord/src/discord-channel.ts` — DiscordChannel class
- `packages/discord/src/discord-channel.test.ts` — tests
- `packages/discord/src/config.ts` — DiscordConfig type + validation

### Modified files

- Root `package.json` — workspace entry if needed

## Design

### DiscordConfig

```typescript
type DiscordConfig = {
  /** Discord bot token (shared with the agent's bot). */
  botToken: string;
  /** Discord channel ID to post proposals in. */
  channelId: string;
  /** Discord user IDs authorized to approve/reject. */
  approverUserIds: string[];
};
```

### DiscordChannel implements ApprovalChannel

- **name**: `"discord"`
- **postProposal**: Send embed with per-file diffs, hash, description.
  Returns `{ channel: "discord", proposalId: discordMessageId }`.
- **waitForApproval**: Listen for ✅ / ❌ reactions on the proposal message.
  Filter by `approverUserIds`. Check `edited_timestamp` on reaction as
  defense-in-depth. Respects AbortSignal for supersession.
  Note: content/hash verification happens in the ProposalManager (core),
  not in the channel implementation.
- **postResult**: Edit original message or post follow-up with outcome.
- **dispose**: Disconnect Discord client.

### Security defenses (from design doc)

1. **Edit detection (defense-in-depth)**: Check `edited_timestamp` on the
   proposal message when a reaction is received. If edited, invalidate
   with visible warning.
2. **Tracked message ID**: Only accept reactions on the daemon's own message.
3. **User ID filtering**: Only `approverUserIds` reactions accepted.
   Bot's own user ID always excluded.
4. **Reconnect**: On reconnect, find existing message by tracked ID, resume or re-propose.

### Key test scenarios (mock Discord.js client)

- Post proposal: correct embed structure, hash in message
- Approval: ✅ from approved user → approved result
- Rejection: ❌ from approved user → rejected result
- Unauthorized user: reaction from non-approved user → ignored
- Bot self-reaction: ignored
- Edit detection: edited message → invalidated with warning
- Content verification: tampered message → rejected
- Abort signal: waitForApproval throws on abort
- Post result: message edited with outcome
- Dispose: client disconnected
- Config validation: missing fields rejected

## Dependencies

- Task 1 (types) — ApprovalChannel interface
- discord.js as a dependency of the new package

## Note on package structure

This is a new package in the monorepo. It depends on `@soulguard/core`
for types only (the interface). The daemon (Task 4) imports it dynamically
at runtime.

## Status

- [ ] Implementation
- [ ] Tests passing
- [ ] Review complete
