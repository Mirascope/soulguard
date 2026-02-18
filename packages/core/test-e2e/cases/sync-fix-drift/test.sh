# Setup: create config and vault file (not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Sync should fix the drift
sudo soulguard sync .

# Verify status is clean after sync
sudo soulguard status .
