# Setup: create config, vault file, init — then delete the vault file
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Delete the vault file so staging exists but vault doesn't
rm SOUL.md

# Run diff — should show vault_missing status
soulguard diff .
