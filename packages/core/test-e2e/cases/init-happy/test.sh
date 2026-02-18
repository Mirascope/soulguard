# Init test: run as root (sudo), verify everything is set up
# Note: soulguardian user/group already exist in the Docker image,
# so init should detect them and skip creation.

echo '# My Soul' > SOUL.md

# Run init as root
sudo soulguard init . --agent-user agent

# Verify vault file is protected
soulguard status .

# Verify staging exists
ls .soulguard/staging/SOUL.md && echo "STAGING EXISTS (GOOD)" || echo "NO STAGING (BAD)"
