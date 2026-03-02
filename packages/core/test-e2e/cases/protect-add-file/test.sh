# Imperative protect: add a new file to protect tier
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

SUDO_USER=agent soulguard init .

echo "BEFORE PROTECT:"
stat -c '%U:%G %a' SOUL.md

# Protect SOUL.md
soulguard protect SOUL.md -w .

echo "AFTER PROTECT:"
stat -c '%U:%G %a' SOUL.md

# Verify staging exists
echo "STAGING:"
test -f .soulguard.SOUL.md && echo "exists" || echo "missing"

# Verify config updated
echo "CONFIG:"
cat soulguard.json

# Agent can't write
su - agent -c "(echo hacked > $(pwd)/SOUL.md) 2>&1" && echo "WRITE OK" || echo "WRITE BLOCKED"
