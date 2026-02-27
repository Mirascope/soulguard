# Approve with --hash (non-interactive, implicit proposal)

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init
soulguard init . --agent-user agent

# Agent modifies staging
su - agent -c "echo '# My Updated Soul' > $(pwd)/.soulguard/staging/SOUL.md"

# Get approval hash from diff output
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Approval hash:' | awk '{print $NF}')
echo "HASH: $HASH"

# Owner approves with hash
soulguard approve . --hash "$HASH"

# Verify vault has new content
echo "VAULT:"
cat SOUL.md
