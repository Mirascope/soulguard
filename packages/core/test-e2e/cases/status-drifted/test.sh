# Setup: create config and vault file, init for user/group but don't sync
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Simulate drift: reset ownership to root
chown root:root SOUL.md
chmod 644 SOUL.md

# Status doesn't need sudo — it's read-only
soulguard status .
