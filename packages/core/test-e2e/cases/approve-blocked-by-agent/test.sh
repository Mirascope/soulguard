# Agent should NOT be able to approve proposals
# (approve writes to vault files owned by soulguardian — agent lacks permission)

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init
soulguard init . --agent-user agent

# Agent modifies staging
su - agent -c "echo '# My Updated Soul' > $(pwd)/.soulguard/staging/SOUL.md"

# Agent proposes
su - agent -c "sudo soulguard propose $(pwd) -m 'update soul'"

# Agent tries to approve (should fail — can't write vault files)
su - agent -c "soulguard approve $(pwd)" 2>&1 || echo "APPROVE BLOCKED (GOOD)"

# Verify vault is UNCHANGED
cat SOUL.md
