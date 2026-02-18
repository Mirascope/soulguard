# Propose → reject flow:
# After reject, staging resets and vault unchanged

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init
soulguard init . --agent-user agent > /dev/null 2>&1

# Agent modifies staging
su - agent -c "echo '# Hacked Soul' > $(pwd)/.soulguard/staging/SOUL.md"

# Agent proposes
su - agent -c "sudo soulguard propose $(pwd)" > /dev/null 2>&1

# Owner rejects
soulguard reject .

# Verify vault unchanged
echo "VAULT:"
cat SOUL.md

# Verify staging reset
echo "STAGING:"
cat .soulguard/staging/SOUL.md
