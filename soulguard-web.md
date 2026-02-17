# @soulguard/web

Browser-based approval interface for soulguard. Serves a minimal local web UI for reviewing and approving vault proposals from your phone or any browser.

## Overview

The web server connects to `@soulguard/core`'s socket API. It does not implement any security logic — it's a UI over the daemon's API.

```mermaid
graph LR
    B[Browser] -->|HTTPS| W[@soulguard/web]
    W -->|socket API| D[@soulguard/core daemon]
    D -->|validate pw| S[.secret]
    D -->|write| V[Vault Files]
```

## Installation

```bash
sudo soulguard install @soulguard/web
```

The web server is installed into the soulguard-owned directory (`/opt/soulguard/`). The agent cannot modify it.

## Configuration

In the workspace's `soulguard.json`:

```json
{
  "web": {
    "enabled": true,
    "port": 9847,
    "host": "0.0.0.0",
    "tls": {
      "cert": "/path/to/cert.pem",
      "key": "/path/to/key.pem"
    }
  }
}
```

For remote access (phone approval), use with Tailscale or a reverse proxy. TLS is recommended for any non-localhost access since the password travels over the connection.

## What It Serves

**`GET /`** — dashboard showing all workspaces and pending proposals.

**`GET /proposals/:id`** — single proposal view with full diff, file context, and approve/reject buttons.

**`POST /proposals/:id/approve`** — submit approval with password. The web server passes the password to the daemon's `approve()` method and discards it immediately.

**`POST /proposals/:id/reject`** — reject a proposal (password required).

**`POST /proposals/:id/withdraw`** — withdraw a proposal (no password required, agent can call).

**`GET /history`** — browse changelog across workspaces.

**`GET /events`** — SSE endpoint for live proposal notifications (powers real-time UI updates).

## Security

- The web server runs as part of the soulguard daemon process (same user, same trust boundary)
- It never stores passwords — receives from form, passes to daemon API, discards
- It never writes to vault files directly — all writes go through the daemon
- If the web server has a bug, vault files are still protected by OS permissions
- TLS recommended for non-localhost access
- The web server is installed in soulguard-owned space — the agent cannot modify its source

## Why Separate from Core

The core daemon should not embed an HTTP server. Not every deployment needs web-based approval. Keeping the web server as a separate package means:

- Core has no HTTP dependencies
- Users who only want CLI approval don't install a web server
- The web server can be updated independently
- The attack surface of core stays minimal
