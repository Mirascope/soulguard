FROM oven/bun:latest

# Create soulguard system user and group
RUN groupadd soulguard && \
    useradd -r -g soulguard soulguardian

# Create agent user (simulates the AI agent's OS user)
RUN useradd -m -s /bin/bash agent

# Install sudo
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/*

# No broad sudoers for agent — init generates scoped rules.
# Agent gets sudo only after `soulguard init` writes /etc/sudoers.d/soulguard.

WORKDIR /app

# Copy full monorepo
COPY . .

# Install deps
RUN bun install --frozen-lockfile

# Make CLI executable
RUN chmod +x packages/core/src/cli.ts

# Create soulguard command
RUN printf '#!/bin/bash\nexec bun /app/packages/core/src/cli.ts "$@"\n' > /usr/local/bin/soulguard && \
    chmod +x /usr/local/bin/soulguard

# Default to root (simulates human/owner running setup)
# Tests switch to agent via `su - agent -c "..."` for agent actions
USER root
