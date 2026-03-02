# Approve with --hash (non-interactive, implicit proposal)

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
EOF

# Owner runs init
SUDO_USER=agent soulguard init .

# Agent modifies staging
su - agent -c "echo '# My Updated Soul' > $(pwd)/.soulguard.SOUL.md"

# Get approval hash from diff output
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')
echo "HASH: $HASH"

# Owner applies with hash
soulguard apply . --hash "$HASH"

# Verify protect-tier file has new content
echo "PROTECTED:"
cat SOUL.md
