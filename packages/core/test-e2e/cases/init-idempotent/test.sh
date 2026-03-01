# Init twice: second run should report nothing to do

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version": 1, "protect":["SOUL.md","soulguard.json"],"watch":[]}
EOF

# First init (as owner/root)
SUDO_USER=agent soulguard init .

echo "--- SECOND RUN ---"

# Second init — should be idempotent
SUDO_USER=agent soulguard init .
