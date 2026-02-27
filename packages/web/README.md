# @soulguard/web

> **Status: Planned** — not yet implemented.

Browser-based approval interface for soulguard. Will serve a minimal local web UI for reviewing diffs and approving vault proposals from your phone or any browser.

## Planned Features

- Diff viewer with syntax highlighting
- Approve/reject buttons with password entry
- Live proposal notifications (SSE)
- Multi-workspace dashboard

## Architecture

The web server will connect to `@soulguard/core`'s API. It will not implement any security logic — just a UI layer over the core library.

```mermaid
graph LR
    B[Browser] -->|HTTPS| W[@soulguard/web]
    W -->|library calls| C[@soulguard/core]
    C -->|write| V[Vault Files]
```

For the core system, see [@soulguard/core](../core/).
