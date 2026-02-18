# Setup: drifted workspace (file not yet protected)
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Agent syncs drifted workspace — chown should fail (no root)
su - agent -c "soulguard sync $(pwd)"
