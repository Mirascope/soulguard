# Reset staging (implicit proposal)
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .

# Agent creates staging and modifies it
su - agent -c "cp $(pwd)/SOUL.md $(pwd)/.soulguard.SOUL.md && echo '# Hacked Soul' > $(pwd)/.soulguard.SOUL.md"

# Owner resets staging
soulguard reset .

# Verify protect-tier unchanged
echo "PROTECTED:"
cat SOUL.md

# Verify staging reset
echo "STAGING:"
cat .soulguard.SOUL.md
