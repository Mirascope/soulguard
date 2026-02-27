# Vault file deletion: agent deletes a file from staging, owner approves.
# Tests the full lifecycle when a vault-protected file is deleted through staging.

# Setup: two vault files
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","BOOTSTRAP.md","soulguard.json"],"ledger":[]}
EOF
echo '# My Soul' > SOUL.md
echo '# Bootstrap' > BOOTSTRAP.md

# Owner runs init
soulguard init . --agent-user agent

# Agent deletes BOOTSTRAP.md from staging (done with it)
su - agent -c "rm $(pwd)/.soulguard/staging/BOOTSTRAP.md"

# Diff should show deletion
echo "DIFF:"
NO_COLOR=1 soulguard diff . 2>&1

# Get hash and approve the deletion
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Approval hash:' | awk '{print $NF}')
soulguard approve . --hash "$HASH"

# BOOTSTRAP.md should be gone from disk
echo "BOOTSTRAP EXISTS:"
test -f BOOTSTRAP.md && echo "yes" || echo "no"

# SOUL.md should still exist
echo "SOUL EXISTS:"
test -f SOUL.md && echo "yes" || echo "no"
