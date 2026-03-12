FROM oven/bun:latest

# Create agent user — simulates the human/owner who runs soulguard
RUN useradd -m -s /bin/bash agent

# Install sudo + git (git needed for e2e tests with git integration)
RUN apt-get update && apt-get install -y sudo git && rm -rf /var/lib/apt/lists/*

# Give agent passwordless sudo (simulates a real user who can sudo)
RUN echo "agent ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/agent

WORKDIR /app

# Copy lockfile + package manifests first (cache-friendly layer for deps)
COPY bun.lock package.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/openclaw/package.json packages/openclaw/package.json
COPY packages/soulguard/package.json packages/soulguard/package.json
COPY packages/discord/package.json packages/discord/package.json

# Install deps (cached unless lockfile/package.json changes)
RUN bun install --frozen-lockfile

# Now copy the rest of the source
COPY . .

# Make CLI executable
RUN chmod +x packages/core/src/cli/cli.ts

# Create soulguard command
RUN printf '#!/bin/bash\nexec bun /app/packages/core/src/cli/cli.ts "$@"\n' > /usr/local/bin/soulguard && \
    chmod +x /usr/local/bin/soulguard

# Run as unprivileged user by default — use `sudo` for privileged commands
USER agent
