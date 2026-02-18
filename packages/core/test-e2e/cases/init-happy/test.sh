# Init test: create workspace, run init, verify protection

# Create a minimal config and soul file
echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# Run init as root
sudo soulguard init . --agent-user agent

# Verify status is clean
soulguard status .

# Verify staging copy exists
ls .soulguard/staging/SOUL.md && echo "STAGING: OK" || echo "STAGING: MISSING"

# Verify agent can't write to vault file
(echo "hacked" > SOUL.md) 2>&1
