FROM oven/bun:latest

# Create test users that mirror the soulguard design
RUN groupadd soulguard && \
    useradd -r -g soulguard soulguardian && \
    useradd -g staff agent 2>/dev/null || useradd agent

WORKDIR /app

# Copy lockfile + package manifests first (cache-friendly layer for deps)
COPY bun.lock package.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/openclaw/package.json packages/openclaw/package.json
COPY packages/soulguard/package.json packages/soulguard/package.json

# Install deps (cached unless lockfile/package.json changes)
RUN bun install --frozen-lockfile

# Now copy the rest of the source (respects .dockerignore)
COPY . .

# Run integration tests as root (needed for chown)
CMD ["bun", "test", "packages/core/test-integration/"]
