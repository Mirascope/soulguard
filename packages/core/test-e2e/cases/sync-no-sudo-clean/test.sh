# After init, agent can sudo soulguard sync on a clean workspace
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

# Owner runs init (creates sudoers for agent)
SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .

# Agent syncs via scoped sudoers — workspace is already clean
su - agent -c "sudo soulguard sync $(pwd)"
