# Zenkai Desktop — Update Architecture

**Document Version:** 1.0.0  
**Scope:** Dual-track update mechanisms, OTA renderer staging, and native binary auto-updates.

---

## 1. Dual-Track Update Model

Zenkai Desktop implements two independent update tracks:

| Track | Target Scope | Update Size | Frequency | Distribution Channel |
|---|---|---|---|---|
| **Track A (OTA Renderer)** | React 19 UI, CSS, page routes, upstream API adapters | ~2–5 MB | High (Weekly / As Needed) | Cloudflare Pages / GitHub CDN (`manifest.json` + `bundle.zip`) |
| **Track B (Native Desktop)** | Electron runtime, Node.js core, native ONNX, WebGPU flags | ~180 MB | Low (Monthly / SemVer) | GitHub Releases (`AppImage`, `NSIS EXE`, `DMG`) |

---

## 2. Track A: Over-The-Air (OTA) Renderer Updates

The OTA renderer update engine (`src/main/renderer-updater.ts`) operates autonomously:

```text
[Check Updates] ──► Query manifest.json & Compare SHA-256 Digest
                         │
                         ▼
             [Download Staged Bundle] ──► Save to `userData/renderer-updates/staged/`
                         │
                         ▼
             [Cryptographic Verification] ──► Compute SHA-256 vs manifest digest
                         │
                         ▼
             [Atomic Activation] ──► Move to `userData/renderer-updates/active/`
                         │
                         ▼
             [Canary Guard Watchdog (5 Seconds)]
             ├── Unhandled Error / Crash ──► Automated Rollback to Factory Bundle
             └── Normal Execution ──► Mark Version Stable
```

---

## 3. Track B: Native Runtime Updates

Native Electron updates are handled by `src/main/updater.ts` via `electron-updater`:
- **Windows**: Downloads delta or full `.exe` installer; executes background NSIS installer on application restart.
- **Linux (AppImage)**: Downloads differential `.AppImage` binary; swaps executable atomically upon restart.
- **Linux (DEB/RPM)**: Automatically downloaded to user's `Downloads` folder with desktop notification prompt.
- **Active Playback Guard**: Updates are never applied while a video is playing or active download jobs are running.

For the exhaustive specification, see [Automated Update Architecture](../releases/UPDATE_ARCHITECTURE.md).

