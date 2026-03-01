# Setup: create config but do NOT init (no .soulguard/staging/)
echo '{"version": 1, "protect": ["SOUL.md"], "watch": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Run diff — should error about missing staging
soulguard diff .
