# Agent must NOT be able to modify proposal.json
# If the agent could edit it, they could change staging files and update
# the hashes to match — completely bypassing staleness detection.

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Owner runs init
soulguard init . --agent-user agent

# Agent modifies staging
su - agent -c "echo '# Tampered Soul' > $(pwd)/.soulguard/staging/SOUL.md"

# Agent proposes (via scoped sudoers)
su - agent -c "sudo soulguard propose $(pwd) -m 'legit proposal'"

# Verify proposal.json exists and is protected
echo "--- proposal.json permissions ---"
stat -c '%U:%G %a' .soulguard/proposal.json

# Agent tries to overwrite proposal.json with tampered hashes
su - agent -c "echo '{\"tampered\": true}' > $(pwd)/.soulguard/proposal.json" 2>&1 || echo "WRITE BLOCKED (GOOD)"

# Agent tries to delete proposal.json
su - agent -c "rm $(pwd)/.soulguard/proposal.json" 2>&1 || echo "DELETE BLOCKED (GOOD)"

# Verify proposal.json is still intact (not tampered)
grep -q '"version"' .soulguard/proposal.json && echo "PROPOSAL INTACT"
