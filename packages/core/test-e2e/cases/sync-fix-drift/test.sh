# Setup: protect SOUL.md, then simulate drift
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard protect SOUL.md -w . > /dev/null 2>&1

# Simulate drift: reset ownership to root
chown root:root SOUL.md
chmod 644 SOUL.md

# Owner syncs to fix drift
soulguard sync .

# Verify status is clean after sync
soulguard status .
