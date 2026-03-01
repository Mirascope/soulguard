# Setup: create config and protect-tier file, init + sync (as owner)
echo '{"version": 1, "protect": ["SOUL.md"], "watch": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1
soulguard sync .

# Status check
soulguard status .
