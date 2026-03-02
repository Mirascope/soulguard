# Glob watch files: watch covers "memory/*.md" pattern.
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
mkdir -p memory
echo '# Day 1' > memory/2026-01-01.md
echo '# Day 2' > memory/2026-01-02.md

SUDO_USER=agent soulguard init .
soulguard watch "memory/*.md" -w .

echo "STATUS:"
NO_COLOR=1 soulguard status . 2>&1

# Simulate drift: wrong ownership on a watch file
chown root:root memory/2026-01-01.md

echo "STATUS AFTER DRIFT:"
NO_COLOR=1 soulguard status . 2>&1

echo "SYNC:"
soulguard sync . 2>&1

echo "STATUS AFTER SYNC:"
NO_COLOR=1 soulguard status . 2>&1
