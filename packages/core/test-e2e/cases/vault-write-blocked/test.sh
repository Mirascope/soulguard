# Setup: create and protect a vault file
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
sudo soulguard sync .

# Attack 1: Try to write to the vaulted file (should fail)
echo "hacked" > SOUL.md 2>&1 && echo "WRITE SUCCEEDED (BAD)" || echo "WRITE BLOCKED (GOOD)"

# Attack 2: Try to chown the file back to agent (should fail without root)
chown agent:agent SOUL.md 2>&1 && echo "CHOWN SUCCEEDED (BAD)" || echo "CHOWN BLOCKED (GOOD)"

# Verify file is still intact
cat SOUL.md
