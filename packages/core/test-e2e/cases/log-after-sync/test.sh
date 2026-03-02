# soulguard log: verifies git integration by checking log after sync.
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md
mkdir -p memory
echo '# Notes' > memory/notes.md

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .
soulguard watch "memory/notes.md" -w .

# Modify a watch file and sync to trigger a second git commit
echo '# Updated Notes' > memory/notes.md
soulguard sync . 2>&1 | grep -v '^$'

echo "LOG:"
soulguard log . | sed 's/^[0-9a-f]* /HASH /g'

echo "LOG FILE:"
soulguard log . memory/notes.md | sed 's/^[0-9a-f]* /HASH /g'
