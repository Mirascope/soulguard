# Setup: create config, protect-tier file, init — but don't modify staging
echo '{"version": 1, "protect": ["SOUL.md"], "watch": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Run diff — should show no changes
soulguard diff .
