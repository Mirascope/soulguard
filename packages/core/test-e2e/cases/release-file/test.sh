# Imperative release: protect a file, then release it
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .

echo "BEFORE RELEASE:"
stat -c '%U:%G %a' SOUL.md

# Release it
soulguard release SOUL.md -w .

echo "AFTER RELEASE:"
stat -c '%U:%G %a' SOUL.md

# Verify config updated
echo "CONFIG:"
cat soulguard.json

# Verify staging cleaned up
echo "STAGING:"
test -f .soulguard.SOUL.md && echo "exists" || echo "missing"
