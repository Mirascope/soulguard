# Self-protection: apply blocks invalid soulguard.json changes.
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .

# Agent creates staging and writes invalid config
su - agent -c "echo '{\"vault\":[\"SOUL.md\"]}' > $(pwd)/.soulguard.soulguard.json"

# Get hash — diff will show the change
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')

# Try to apply — should be blocked by self-protection
echo "APPROVE:"
soulguard apply . --hash "$HASH" 2>&1 || true

# Verify soulguard.json is unchanged
echo "CONFIG:"
cat soulguard.json
