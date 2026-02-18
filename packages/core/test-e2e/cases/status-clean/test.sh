# Setup: create config and vault file, protect them (as owner)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard sync .

# Status check
soulguard status .
