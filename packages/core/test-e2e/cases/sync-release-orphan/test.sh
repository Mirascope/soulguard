# sync reconciliation: files removed from config get released.
# Verifies that sync restores original ownership when a file
# is removed from soulguard.json.

cat > soulguard.json <<'EOF'
{"version":1,"files":{"soulguard.json":"protect","SOUL.md":"protect"}}
EOF
echo '# My Soul' > SOUL.md

# Owner runs init — snapshots original ownership, then chowns
SUDO_USER=agent soulguard init .

echo "BEFORE:"
stat -c '%U:%G %a' SOUL.md

# Remove SOUL.md from config
cat > soulguard.json <<'EOF'
{"version":1,"files":{"soulguard.json":"protect"}}
EOF

# Sync should release SOUL.md (restore original ownership)
echo "SYNC:"
NO_COLOR=1 soulguard sync . 2>&1 | grep -v '^$'

echo "AFTER:"
stat -c '%U:%G %a' SOUL.md
