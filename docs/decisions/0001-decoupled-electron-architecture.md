# ADR-0001: Decoupled Electron Shell & Bundled React 19 Frontend

- **Status**: ACCEPTED
- **Date**: 2026-11-15
- **Commit**: `50ffa5f`
- **Deciders**: Desktop Architecture Team

---

## Context

Zenkai originally existed as an authentic React 19 web application hosted on Cloudflare Pages (`zenkai-web.pages.dev`). A desktop solution was required to deliver offline downloads, native window controls, Discord RPC, system tray management, and local GPU enhancement.

Two architectural options existed:
1. **Thin Web Wrapper**: Launch Electron and navigate directly to `https://zenkai-web.pages.dev`.
2. **Decoupled Bundled Shell**: Package the compiled React 19 client assets inside the Electron application bundle, loading them via local custom protocol (`zenkai://app/` or `file://`), with remote API fallbacks.

## Decision

We chose **Option 2: Decoupled Bundled Shell**.

1. The renderer is compiled locally during `pnpm build` via Vite and bundled into the production package (`out/renderer`).
2. The renderer runs in a sandboxed Chromium context with `nodeIntegration: false`, `contextIsolation: true`, and strict CSP.
3. Native desktop features are exposed solely through a typed preload contract (`window.zenkai`) covering 9 namespaces: `app`, `auth`, `playback`, `downloads`, `discord`, `system`, `settings`, `vision`, `updater`.
4. Upstream API requests are proxied via a local loopback server or custom protocol handler in the main process to bypass CORS and prevent browser fingerprinting.

## Alternatives Considered

- **Thin Web Wrapper**: Rejected because offline usage is impossible, network latency directly affects initial rendering, and Chromium sandbox restrictions prevent native disk/system access without weakening security boundaries.

## Consequences

### Positive
- Instant offline startup with zero network dependencies for base UI.
- Deterministic behavior immune to Cloudflare Pages routing disruptions or downtime.
- Strict security model compliant with Electron security best practices.

### Negative / Trade-offs
- Packaged application size is larger (~180MB AppImage) due to bundled web assets and Chromium runtime.
- Web UI updates require either an over-the-air asset update mechanism (see ADR-0002) or a desktop binary release.

