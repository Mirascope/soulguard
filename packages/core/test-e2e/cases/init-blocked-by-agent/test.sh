# After init writes scoped sudoers, agent can't run init again.
# The first init succeeds (broad Docker sudoers). It then overwrites
# /etc/sudoers.d/soulguard with scoped rules (no init allowed).
# The second attempt should be denied.

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"vault":["SOUL.md","soulguard.json"],"ledger":[]}
EOF

# First init — succeeds (broad sudoers still in place)
sudo soulguard init . --agent-user agent

echo "--- AGENT TRIES INIT AGAIN ---"

# Second init — should fail (scoped sudoers blocks init)
sudo soulguard init . --agent-user agent
