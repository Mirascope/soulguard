# After init, agent can sudo soulguard sync on a clean workspace
echo '{"vault": ["SOUL.md"], "ledger": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Owner runs init (creates sudoers for agent)
soulguard init . --agent-user agent

# Agent syncs via scoped sudoers — workspace is already clean
su - agent -c "sudo soulguard sync $(pwd)"
