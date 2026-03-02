# Protect-tier file deletion: agent deletes a file from staging, owner applies.
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
echo '# Bootstrap' > BOOTSTRAP.md

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md BOOTSTRAP.md -w .

# Agent deletes BOOTSTRAP.md from staging (done with it)
su - agent -c "rm $(pwd)/.soulguard.BOOTSTRAP.md"

# Diff should show deletion
echo "DIFF:"
NO_COLOR=1 soulguard diff . 2>&1

# Get hash and apply the deletion
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')
soulguard apply . --hash "$HASH"

# BOOTSTRAP.md should be gone from disk
echo "BOOTSTRAP EXISTS:"
test -f BOOTSTRAP.md && echo "yes" || echo "no"

# SOUL.md should still exist
echo "SOUL EXISTS:"
test -f SOUL.md && echo "yes" || echo "no"
