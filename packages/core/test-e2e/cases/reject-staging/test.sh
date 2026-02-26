# Reject resets staging (implicit proposal)

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init
soulguard init . --agent-user agent

# Agent modifies staging
su - agent -c "echo '# Hacked Soul' > $(pwd)/.soulguard/staging/SOUL.md"

# Owner rejects
soulguard reject .

# Verify vault unchanged
echo "VAULT:"
cat SOUL.md

# Verify staging reset
echo "STAGING:"
cat .soulguard/staging/SOUL.md
