# Setup: create config and protect-tier file, init for user/group
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1

# Simulate drift: reset ownership to root
chown root:root SOUL.md
chmod 644 SOUL.md

# Owner syncs to fix drift
soulguard sync .

# Verify status is clean after sync
soulguard status .
