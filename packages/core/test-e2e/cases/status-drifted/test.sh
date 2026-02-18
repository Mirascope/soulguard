# Setup: create config and vault file (not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Status doesn't need sudo — it's read-only
soulguard status .
