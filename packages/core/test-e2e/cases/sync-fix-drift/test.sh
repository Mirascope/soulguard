# Setup: create config and vault file (not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Owner syncs
soulguard sync .

# Verify status is clean after sync
soulguard status .
