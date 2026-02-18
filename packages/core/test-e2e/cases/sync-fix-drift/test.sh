# Setup: create config and vault file, init for user/group
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Simulate drift: reset ownership to root
chown root:root SOUL.md
chmod 644 SOUL.md

# Owner syncs to fix drift
soulguard sync .

# Verify status is clean after sync
soulguard status .
