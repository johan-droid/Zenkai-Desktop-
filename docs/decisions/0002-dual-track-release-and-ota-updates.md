# ADR-0002: Dual-Track Release & Over-The-Air Update Engine

- **Status**: ACCEPTED
- **Date**: 2026-11-15
- **Commit**: `50ffa5f`
- **Deciders**: Release Engineering Team

---

## Context

Desktop applications that bundle web frontends face a release friction dilemma: UI improvements and API adapter fixes must ship quickly to keep pace with web changes, but forcing users to download 200MB native binary updates weekly creates upgrade fatigue and bandwidth waste. Conversely, relying purely on remote web loading forfeits offline resilience.

## Decision

We adopted a **Dual-Track Release Model**:

1. **Track A (Over-The-Air Renderer Updates)**:
   - Frontend UI fixes and adapter updates are published as lightweight signed zip bundles (`manifest.json` + `bundle.zip`).
   - The desktop client (`src/main/renderer-updater.ts`) polls the update endpoint periodically or on launch.
   - Updates are downloaded to `userData/renderer-updates/staged` and verified via SHA-256 before activation.
   - **Canary Guard**: A 5-second post-launch health watchdog monitors renderer vitality. If an unhandled fatal error or blank screen occurs, it instantly rolls back to the previous staged version or the factory-bundled assets.

2. **Track B (Native Electron Runtime Releases)**:
   - Core runtime upgrades, Node.js native bindings (ONNX Runtime, SQLite, WebGPU switches), and IPC schema changes trigger native desktop installer builds via `electron-builder` (`AppImage`, `DEB`, `RPM`, `NSIS EXE`, `Portable ZIP`).
   - Native updates are managed by `src/main/updater.ts` via `electron-updater` targeting GitHub Releases.

## Alternatives Considered

- **Single Native-Only Releases**: Rejected due to high release latency and poor user experience for minor CSS/HTML patches.
- **Pure Web-Hosted Renderer**: Rejected due to offline degradation and vulnerability to web origin disruptions (see ADR-0001).

## Consequences

### Positive
- Sub-second UI updates without desktop installer downloads.
- Crash-resilient updates with automated rollback protection.
- Native binary releases are reserved for structural, low-frequency runtime updates.

### Negative / Trade-offs
- Two separate update pipelines must be maintained and verified in testing.
- Preload contract versions must maintain backward compatibility across OTA renderer versions.

