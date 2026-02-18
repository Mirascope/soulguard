# Setup: drifted workspace (file not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Sync without sudo on drifted workspace — chown should fail
soulguard sync .
