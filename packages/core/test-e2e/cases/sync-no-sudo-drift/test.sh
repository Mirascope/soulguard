# Agent can't fix drift without sudo (no init = no scoped sudoers)
echo '{"version":1,"files":{"SOUL.md":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

# Make workspace readable by agent (no init, no sudoers)
chmod 755 .
chmod o+r soulguard.json SOUL.md

# Agent syncs drifted workspace without sudo — chown should fail
su - agent -c "soulguard sync $(pwd)"
