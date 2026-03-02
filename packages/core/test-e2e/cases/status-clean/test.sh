# Setup: protect SOUL.md via imperative command
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1
soulguard protect SOUL.md -w . > /dev/null 2>&1
soulguard sync .

# Status check
soulguard status .
