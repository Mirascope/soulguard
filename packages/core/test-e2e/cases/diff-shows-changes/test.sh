# Setup: create config, protect-tier file, init + create staging with modification
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1

# Create staging with modified copy
cp SOUL.md .soulguard.SOUL.md
echo '# My Modified Soul' > .soulguard.SOUL.md

# Run diff
soulguard diff .
