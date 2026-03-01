# Init twice: second run should report nothing to do

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version": 1, "protect":["SOUL.md","soulguard.json"],"watch":[]}
EOF

# First init (as owner/root)
soulguard init . --agent-user agent

echo "--- SECOND RUN ---"

# Second init — should be idempotent
soulguard init . --agent-user agent
