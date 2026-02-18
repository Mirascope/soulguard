# Setup: already-protected workspace
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
sudo soulguard sync .

# Sync without sudo on a clean workspace — nothing to fix, should succeed
soulguard sync .
