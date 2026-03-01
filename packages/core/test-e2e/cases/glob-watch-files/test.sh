# Glob ledger files: ledger protects "memory/*.md" pattern.
# Tests that glob patterns resolve to actual files in status and sync.

# Setup: config with glob ledger pattern
cat > soulguard.json <<'EOF'
{"version":1,"files":{"soulguard.json":"protect","memory/*.md":"watch"}}
EOF
mkdir -p memory
echo '# Day 1' > memory/2026-01-01.md
echo '# Day 2' > memory/2026-01-02.md

# Owner runs init
SUDO_USER=agent soulguard init .

echo "STATUS:"
NO_COLOR=1 soulguard status . 2>&1

# Simulate drift: wrong ownership on a ledger file
chown root:root memory/2026-01-01.md

echo "STATUS AFTER DRIFT:"
NO_COLOR=1 soulguard status . 2>&1

echo "SYNC:"
soulguard sync . 2>&1

echo "STATUS AFTER SYNC:"
NO_COLOR=1 soulguard status . 2>&1
