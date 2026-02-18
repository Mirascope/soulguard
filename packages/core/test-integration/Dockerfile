FROM oven/bun:latest

# Create test users that mirror the soulguard design
RUN groupadd soulguard && \
    useradd -r -g soulguard _soulguard && \
    useradd -g staff agent 2>/dev/null || useradd agent

WORKDIR /app

# Copy full monorepo (respects .dockerignore)
COPY . .

# Install deps
RUN bun install --frozen-lockfile

# Run integration tests as root (needed for chown)
CMD ["bun", "test", "packages/core/test-integration/"]
