# After owner runs init, agent can't run init again.
# Init writes scoped sudoers that excludes init and apply.

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version": 1, "protect":["SOUL.md","soulguard.json"],"watch":[]}
EOF

# Owner runs init (as root)
soulguard init . --agent-user agent

echo "--- AGENT TRIES INIT ---"

# Agent tries init — should be denied by scoped sudoers
su - agent -c "sudo soulguard init $(pwd) --agent-user agent" 2>&1
