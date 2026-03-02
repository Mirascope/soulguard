# Setup: protect-tier file, init — but don't modify staging
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard protect SOUL.md -w . > /dev/null 2>&1

# Agent creates staging (on-demand, unmodified copy)
su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md"

# Run diff — should show no changes
soulguard diff .
