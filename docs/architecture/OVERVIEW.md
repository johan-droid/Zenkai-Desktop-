# Zenkai Desktop — Architecture Overview

**Document Version:** 1.0.0  
**Scope:** High-level system topology, process model, and architectural tiers.

---

## 1. System Topology

Zenkai Desktop is an Electron application featuring a decoupled client-server architecture inside a single native package:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Operating System                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      Electron Main Process                      │   │
│   │                                                                 │   │
│   │  • App Lifecycle & Window Management (`src/main/index.ts`)       │   │
│   │  • GPU & Hardware Acceleration Configuration (`src/main/gpu.ts`)│   │
│   │  • Native Decryption Download Pipeline (`src/main/downloads/`)  │   │
│   │  • OTA & Native Update Managers (`renderer-updater`, `updater`) │   │
│   │  • Local Streaming Proxy & Server Adapters (`src/main/api/`)    │   │
│   │  • System Tray, Discord RPC, Custom Schemes (`zenkai://`)       │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                      │
│                  Strict IPC Contract (Zod-Validated)                    │
│                                  │                                      │
│   ┌──────────────────────────────▼──────────────────────────────────┐   │
│   │                     Isolated Preload Bridge                     │   │
│   │                       (`src/preload/index.ts`)                  │   │
│   │                                                                 │   │
│   │  Exposes window.zenkai:                                         │   │
│   │  • app      • auth     • playback  • downloads • discord        │   │
│   │  • system   • settings • vision    • updater   • gpu            │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │ Context Isolation                    │
│   ┌──────────────────────────────▼──────────────────────────────────┐   │
│   │                   Sandboxed Renderer Process                    │   │
│   │                       (`src/renderer/src/`)                     │   │
│   │                                                                 │   │
│   │  • React 19 Engine + React Router v7                            │   │
│   │  • 36 Application Pages (Browse, Player, Manga, Novel, etc.)   │   │
│   │  • Live WebGPU Zenkai Vision Pipeline (Anime4K Shaders)         │   │
│   │  • Hls.js Adaptive Streaming Engine                             │   │
│   │  • Authentic Bundled Offline Catalog Fallback                   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

1. **Security-First Process Isolation**:
   - The renderer has zero direct access to Node.js system calls or filesystem APIs.
   - Preload acts as a strictly typed firewall using `contextBridge.exposeInMainWorld`.
2. **Zero-Mock Production Integrity**:
   - All live queries communicate with authentic upstream endpoints.
   - Offline mode relies on authentic pre-bundled metadata snapshots, not synthetic mocks.
3. **Resilient Dual-Track Updating**:
   - Web frontend updates can be deployed over the air (OTA) with 5-second canary rollback guards.
   - Native runtime updates are delivered via GitHub Releases and `electron-updater`.
4. **Universal Hardware Acceleration**:
   - Platform-aware Chromium flag injection enables WebGPU and native hardware video decoding (VA-API on Linux, D3D11 on Windows, VideoToolbox on macOS) with seamless software fallback.

