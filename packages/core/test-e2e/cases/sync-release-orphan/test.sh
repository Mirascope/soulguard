# sync reconciliation: files removed from config get released.
echo '{"version":1,"files":{"soulguard.json":"protect"}}' > soulguard.json
echo '# My Soul' > SOUL.md

SUDO_USER=agent soulguard init .
soulguard protect SOUL.md -w .

echo "BEFORE:"
stat -c '%U:%G %a' SOUL.md

# Release SOUL.md via imperative command
soulguard release SOUL.md -w .

echo "AFTER:"
stat -c '%U:%G %a' SOUL.md
