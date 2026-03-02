# Init test: owner sets up workspace, verify protection works for agent
# Runs as root (owner), switches to agent for verification

# Create a minimal config and soul file
echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
EOF

# Owner runs init
SUDO_USER=agent soulguard init .

# Owner verifies status is clean
soulguard status .

# Staging siblings are not eagerly created — verify they don't exist
ls .soulguard.SOUL.md 2>&1 && echo "STAGING: EXISTS" || echo "STAGING: NOT PRE-CREATED"

# Agent can't write to protect-tier file
su - agent -c "(echo hacked > $(pwd)/SOUL.md) 2>&1"
