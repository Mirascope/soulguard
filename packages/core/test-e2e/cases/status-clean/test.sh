# Setup: create config and vault file, init + sync (as owner)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1
soulguard sync .

# Status check
soulguard status .
