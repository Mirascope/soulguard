# Setup: create and protect a vault file (as owner/root)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1
soulguard sync .

# Attack 1: Agent tries to write to the vaulted file (should fail)
su - agent -c "(echo hacked > $(pwd)/SOUL.md) 2>&1" && echo "WRITE SUCCEEDED (BAD)" || echo "WRITE BLOCKED (GOOD)"

# Attack 2: Agent tries to chown the file back (should fail without root)
su - agent -c "chown agent:agent $(pwd)/SOUL.md 2>&1" && echo "CHOWN SUCCEEDED (BAD)" || echo "CHOWN BLOCKED (GOOD)"

# Verify file is still intact
cat SOUL.md
