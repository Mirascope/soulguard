# Setup: create and protect a protect-tier file (as owner/root)
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard sync .

# Attack 1: Agent tries to write to the protected file (should fail)
su - agent -c "(echo hacked > $(pwd)/SOUL.md) 2>&1" && echo "WRITE SUCCEEDED (BAD)" || echo "WRITE BLOCKED (GOOD)"

# Attack 2: Agent tries to chown the file back (should fail without root)
su - agent -c "chown agent:agent $(pwd)/SOUL.md 2>&1" && echo "CHOWN SUCCEEDED (BAD)" || echo "CHOWN BLOCKED (GOOD)"

# Verify file is still intact
cat SOUL.md
