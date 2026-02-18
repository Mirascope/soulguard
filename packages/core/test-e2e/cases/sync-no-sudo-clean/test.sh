# Setup: already-protected workspace (owner syncs first)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard sync .

# Make workspace readable by agent
chmod 755 .
chmod o+r soulguard.json

# Agent syncs a clean workspace — nothing to fix, should succeed
su - agent -c "soulguard sync $(pwd)"
