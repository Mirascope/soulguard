# Setup: protect-tier file, init + create staging with modification
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard protect SOUL.md -w . > /dev/null 2>&1

# Create staging with modified copy
echo '# My Modified Soul' > .soulguard.SOUL.md

# Run diff
soulguard diff .
