# Reset staging (implicit proposal)

echo '# My Soul' > SOUL.md
cat > soulguard.json <<'EOF'
{"version": 1, "protect":["SOUL.md","soulguard.json"],"watch":[]}
EOF

# Owner runs init
SUDO_USER=agent soulguard init .

# Agent modifies staging
su - agent -c "echo '# Hacked Soul' > $(pwd)/.soulguard.SOUL.md"

# Owner resets staging
soulguard reset .

# Verify protect-tier unchanged
echo "PROTECTED:"
cat SOUL.md

# Verify staging reset
echo "STAGING:"
cat .soulguard.SOUL.md
