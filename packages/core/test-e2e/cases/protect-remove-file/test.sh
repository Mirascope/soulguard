# Protect-tier file deletion: agent deletes a file from staging, owner applies.
# Tests the full lifecycle when a protect-tier protected file is deleted through staging.

# Setup: two protect-tier files
cat > soulguard.json <<'EOF'
{"version": 1, "protect":["SOUL.md","BOOTSTRAP.md","soulguard.json"],"watch":[]}
EOF
echo '# My Soul' > SOUL.md
echo '# Bootstrap' > BOOTSTRAP.md

# Owner runs init
SUDO_USER=agent soulguard init .

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
