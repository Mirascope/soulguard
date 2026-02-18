# Setup: create config and vault file (not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Status should show drift (file owned by agent, not _soulguard)
sudo soulguard status .
