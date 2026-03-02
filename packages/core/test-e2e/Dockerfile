FROM oven/bun:latest

# Create agent user only — soulguardian/soulguard are created by `soulguard init`
RUN useradd -m -s /bin/bash agent

# Install sudo + git (git needed for e2e tests with git integration)
RUN apt-get update && apt-get install -y sudo git && rm -rf /var/lib/apt/lists/*

# No broad sudoers for agent — init generates scoped rules.
# Agent gets sudo only after `soulguard init` writes /etc/sudoers.d/soulguard.

WORKDIR /app

# Copy lockfile + package manifests first (cache-friendly layer for deps)
COPY bun.lock package.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/openclaw/package.json packages/openclaw/package.json
COPY packages/soulguard/package.json packages/soulguard/package.json

# Install deps (cached unless lockfile/package.json changes)
RUN bun install --frozen-lockfile

# Now copy the rest of the source
COPY . .

# Make CLI executable
RUN chmod +x packages/core/src/cli.ts

# Create soulguard command
RUN printf '#!/bin/bash\nexec bun /app/packages/core/src/cli.ts "$@"\n' > /usr/local/bin/soulguard && \
    chmod +x /usr/local/bin/soulguard

# Default to root (simulates human/owner running setup)
# Tests switch to agent via `su - agent -c "..."` for agent actions
USER root
