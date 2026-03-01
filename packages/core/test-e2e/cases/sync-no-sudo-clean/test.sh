# After init, agent can sudo soulguard sync on a clean workspace
echo '{"version": 1, "protect": ["SOUL.md"], "watch": []}' > soulguard.json
echo '# My Soul' > SOUL.md

# Owner runs init (creates sudoers for agent)
soulguard init . --agent-user agent

# Agent syncs via scoped sudoers — workspace is already clean
su - agent -c "sudo soulguard sync $(pwd)"
