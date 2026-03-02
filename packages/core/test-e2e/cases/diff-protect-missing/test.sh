# Setup: create config, protect-tier file, init — then delete the protect-tier file
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
SUDO_USER=agent soulguard init . > /dev/null 2>&1

# Delete the protect-tier file so staging exists but vault doesn't
rm SOUL.md

# Run diff — should show vault_missing status
soulguard diff .
