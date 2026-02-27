# Glob vault files: vault protects "skills/*.md" pattern.
# Tests that glob patterns resolve to actual files in status, diff, and approve.

# Setup: vault with glob + a couple matching files
cat > soulguard.json <<'EOF'
{"vault":["soulguard.json","skills/*.md"],"ledger":[]}
EOF
mkdir -p skills
echo '# Python' > skills/python.md
echo '# TypeScript' > skills/typescript.md

# Owner runs init
soulguard init . --agent-user agent

echo "STATUS:"
NO_COLOR=1 soulguard status . 2>&1

# Agent modifies a skill
su - agent -c "echo '# Python v2' > $(pwd)/.soulguard/staging/skills/python.md"

echo "DIFF:"
NO_COLOR=1 soulguard diff . 2>&1

# Approve the change
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Approval hash:' | awk '{print $NF}')
echo "APPROVE:"
soulguard approve . --hash "$HASH"

echo "VAULT CONTENT:"
cat skills/python.md
