# Setup: create config and vault file, protect them
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Protect files (needs root for chown)
sudo soulguard sync .

# Now check status — should be all clean
sudo soulguard status .
