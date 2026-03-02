# Init twice: second run should report nothing to do

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version":1,"files":{"SOUL.md":"protect","soulguard.json":"protect"}}
EOF

# First init (as owner/root)
SUDO_USER=agent soulguard init .

echo "--- SECOND RUN ---"

# Second init — should be idempotent
SUDO_USER=agent soulguard init .
