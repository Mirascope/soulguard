# Full propose → approve flow

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init (show output to catch staging permission issues)
soulguard init . --agent-user agent

# Agent modifies the staging copy
su - agent -c "echo '# My Updated Soul' > $(pwd)/.soulguard/staging/SOUL.md"

# Agent proposes (via scoped sudoers)
su - agent -c "sudo soulguard propose $(pwd) -m 'update soul'"

# Owner approves
soulguard approve .

# Verify vault has new content
cat SOUL.md
