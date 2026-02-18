FROM oven/bun:latest

# Create soulguard system user and group
RUN groupadd soulguard && \
    useradd -r -g soulguard _soulguard

# Create agent user (simulates the AI agent's OS user)
RUN useradd -m -s /bin/bash agent

# Install sudo
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/*

# Agent can sudo soulguard commands (simulates daemon running as root)
RUN echo "agent ALL=(root) NOPASSWD: /usr/local/bin/soulguard" >> /etc/sudoers.d/soulguard

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

# Run e2e tests as agent user
USER agent
CMD ["bash", "/app/packages/core/test-e2e/run-tests.sh"]
