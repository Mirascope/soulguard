# Init twice: second run should report nothing to do
echo '# My Soul' > SOUL.md

# First init
sudo soulguard init . --agent-user agent

echo "--- SECOND RUN ---"

# Second init — should be idempotent
sudo soulguard init . --agent-user agent
