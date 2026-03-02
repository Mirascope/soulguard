# Glob protect-tier files: protect tier covers "skills/*.md" pattern.
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
mkdir -p skills
echo '# Python' > skills/python.md
echo '# TypeScript' > skills/typescript.md

SUDO_USER=agent soulguard init .
soulguard protect "skills/*.md" -w .

# Agent creates staging copies
su - agent -c "cp $(pwd)/skills/python.md $(pwd)/skills/.soulguard.python.md && cp $(pwd)/skills/typescript.md $(pwd)/skills/.soulguard.typescript.md"

echo "STATUS:"
NO_COLOR=1 soulguard status . 2>&1

# Agent modifies a skill staging copy
su - agent -c "echo '# Python v2' > $(pwd)/skills/.soulguard.python.md"

echo "DIFF:"
NO_COLOR=1 soulguard diff . 2>&1

# Approve the change
HASH=$(NO_COLOR=1 soulguard diff . 2>&1 | grep 'Apply hash:' | awk '{print $NF}')
echo "APPROVE:"
soulguard apply . --hash "$HASH"

echo "VAULT CONTENT:"
cat skills/python.md
