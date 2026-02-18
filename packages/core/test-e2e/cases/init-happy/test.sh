# Init test: owner sets up workspace, verify protection works for agent
# Runs as root (owner), switches to agent for verification

# Create a minimal config and soul file
echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init
soulguard init . --agent-user agent

# Owner verifies status is clean
soulguard status .

# Verify staging copy exists
ls .soulguard/staging/SOUL.md && echo "STAGING: OK" || echo "STAGING: MISSING"

# Agent can't write to vault file
su - agent -c "(echo hacked > $(pwd)/SOUL.md) 2>&1"
