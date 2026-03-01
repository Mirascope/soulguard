# Setup: create config, protect-tier file, init — then delete the protect-tier file
echo '{"version": 1, "protect": ["SOUL.md"], "watch": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Delete the protect-tier file so staging exists but vault doesn't
rm SOUL.md

# Run diff — should show vault_missing status
soulguard diff .
