# Setup: already-protected workspace (owner syncs first)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard sync .

# Agent syncs a clean workspace — nothing to fix, should succeed
su - agent -c "soulguard sync $(pwd)"
