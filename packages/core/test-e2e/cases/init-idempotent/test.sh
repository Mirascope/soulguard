# Init twice: second run should report nothing to do

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# First init
sudo soulguard init . --agent-user agent

echo "--- SECOND RUN ---"

# Second init — should be idempotent
sudo soulguard init . --agent-user agent
