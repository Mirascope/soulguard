# Self-protection: apply blocks invalid soulguard.json changes.
# Even if the owner provides the correct hash, soulguard refuses to
# brick itself by writing an invalid config.

cat > soulguard.json <<'EOF'
{"version": 1, "protect":["SOUL.md","soulguard.json"],"watch":[]}
EOF
echo '# My Soul' > SOUL.md

# Owner runs init
SUDO_USER=agent soulguard init .

# Agent writes invalid config to staging (missing "ledger" field)
su - agent -c "echo '{\"vault\":[\"SOUL.md\"]}' > $(pwd)/.soulguard.soulguard.json"

# Get hash — diff will show the change
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')

# Try to apply — should be blocked by self-protection
echo "APPROVE:"
soulguard apply . --hash "$HASH" 2>&1 || true

# Verify soulguard.json is unchanged
echo "CONFIG:"
cat soulguard.json
