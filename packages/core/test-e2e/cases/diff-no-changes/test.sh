# Setup: create config, vault file, init — but don't modify staging
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Run diff — should show no changes
soulguard diff .
