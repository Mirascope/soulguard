# Setup: create config and protect-tier file, init + sync (as owner)
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard sync .

# Status check
soulguard status .
