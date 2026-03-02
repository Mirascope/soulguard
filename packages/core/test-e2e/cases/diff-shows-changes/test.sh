# Setup: protect-tier file, init + create staging with modification
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard protect SOUL.md -w . > /dev/null 2>&1

# Agent creates staging with modified content
su - agent -c "echo '# My Modified Soul' > $(pwd)/.soulguard.SOUL.md"

# Run diff
soulguard diff .
