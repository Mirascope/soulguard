# Setup: create config, vault file, init + create staging with modification
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md
soulguard init . --agent-user agent > /dev/null 2>&1

# Create staging with modified copy
mkdir -p .soulguard/staging
cp SOUL.md .soulguard/staging/SOUL.md
echo '# My Modified Soul' > .soulguard/staging/SOUL.md

# Run diff
soulguard diff .
