# Approve with --hash (non-interactive, implicit proposal)

echo '# My Soul' > SOUL.md
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .

# Agent creates staging and modifies it
su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md && echo '# My Updated Soul' > $(pwd)/.soulguard.SOUL.md"

# Get approval hash from diff output
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')
echo "HASH: $HASH"

# Owner applies with hash
soulguard apply . --hash "$HASH"

# Verify protect-tier file has new content
echo "PROTECTED:"
cat SOUL.md
