# After init, agent can sudo soulguard sync on a clean workspace
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

# Owner runs init (creates sudoers for agent)
SUDO_USER=agent soulguard init .

# Agent syncs via scoped sudoers — workspace is already clean
su - agent -c "sudo soulguard sync $(pwd)"
