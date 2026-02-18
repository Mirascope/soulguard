# Setup: create config but do NOT init (no .soulguard/staging/)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Run diff — should error about missing staging
soulguard diff .
