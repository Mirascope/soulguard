# soulguard log: verifies git integration by checking log after sync.

cat > soulguard.json <<'EOF'
{"version":1,"files":{"soulguard.json":"protect","SOUL.md":"protect","memory/notes.md":"watch"}}
EOF
echo '# My Soul' > SOUL.md
mkdir -p memory
echo '# Notes' > memory/notes.md

# Owner runs init (creates git repo + initial sync)
SUDO_USER=agent soulguard init .

# Modify a watch file and sync to trigger a second git commit
echo '# Updated Notes' > memory/notes.md
soulguard sync . 2>&1 | grep -v '^$'

echo "LOG:"
# Strip commit hashes (first 7+ chars) for deterministic comparison
soulguard log . | sed 's/^[0-9a-f]* /HASH /g'

echo "LOG FILE:"
soulguard log . memory/notes.md | sed 's/^[0-9a-f]* /HASH /g'
