# Setup: create config and vault file (not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Sync needs sudo for chown
sudo soulguard sync .

# Verify status is clean after sync (no sudo needed)
soulguard status .
