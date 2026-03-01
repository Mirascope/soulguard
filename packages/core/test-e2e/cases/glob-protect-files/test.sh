# Glob protect-tier files: protect tier covers "skills/*.md" pattern.
# Tests that glob patterns resolve to actual files in status, diff, and apply.

# Setup: vault with glob + a couple matching files
cat > soulguard.json <<'EOF'
{"version":1,"files":{"soulguard.json":"protect","skills/*.md":"protect"}}
EOF
mkdir -p skills
echo '# Python' > skills/python.md
echo '# TypeScript' > skills/typescript.md

# Owner runs init
SUDO_USER=agent soulguard init .

echo "STATUS:"
NO_COLOR=1 soulguard status . 2>&1

# Agent modifies a skill
su - agent -c "echo '# Python v2' > $(pwd)/skills/.soulguard.python.md"

echo "DIFF:"
NO_COLOR=1 soulguard diff . 2>&1

# Approve the change
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')
echo "APPROVE:"
soulguard apply . --hash "$HASH"

echo "VAULT CONTENT:"
cat skills/python.md
