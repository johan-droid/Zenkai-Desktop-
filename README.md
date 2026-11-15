# Zenkai Desktop ⚡

[![CI](https://github.com/johan-droid/Zenkai-Desktop-/actions/workflows/ci.yml/badge.svg)](https://github.com/johan-droid/Zenkai-Desktop-/actions/workflows/ci.yml)
[![Release](https://github.com/johan-droid/Zenkai-Desktop-/actions/workflows/release.yml/badge.svg)](https://github.com/johan-droid/Zenkai-Desktop-/actions/workflows/release.yml)
[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-purple.svg)](electron-builder.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-informational.svg)](tsconfig.json)

**Zenkai Desktop** is a premier, high-performance standalone desktop application for streaming anime, downloading episodes offline, and tracking your watch history with native Discord Rich Presence. 

Engineered with an isolated Electron architecture, a hardened IPC bridge, a native in-memory AES-128 HLS decrypting download engine, and a stunning claymorphic/obsidian desktop UI.

---

## 📥 Direct Downloads & Installation

Pre-packaged standalone release binaries are ready for direct download:

### 🐧 Linux (Ubuntu, Debian, Fedora, Arch)
* **AppImage (Standalone, no install needed)**:
  ```bash
  chmod +x Zenkai-0.0.1.AppImage
  ./Zenkai-0.0.1.AppImage
  ```
* **Debian / Ubuntu Package (`.deb`)**:
  ```bash
  sudo dpkg -i zenkai-desktop_0.0.1_amd64.deb
  sudo apt-get install -f # resolve any missing system dependencies
  ```
* **Fedora / RHEL (`.rpm`)**:
  ```bash
  sudo rpm -i zenkai-desktop-0.0.1.x86_64.rpm
  ```
  *(Note: Linux notifications require `libnotify-bin` / `libnotify4`)*

### 🪟 Windows (10 / 11)
* **NSIS Installer**: `Zenkai-Setup-0.0.1.exe`
* **Portable Binary**: `Zenkai-0.0.1-portable.exe` (run directly without administrative installation)

### 🍎 macOS (12 Monterey & later)
* **Universal Disk Image**: `Zenkai-0.0.1-universal.dmg` (supports both Apple Silicon M-series and Intel x64)
* **Zip Archive**: `Zenkai-0.0.1-mac.zip`

---

## ✨ Features

* **🌟 Standalone Discovery Hub**: Browse live trending anime, popular series, ratings, and synopses powered by AniList GraphQL with instant offline fallbacks.
* **🎬 High-Definition Streaming Player**: Integrated `hls.js` player with custom controls, Picture-in-Picture (PiP), multi-server selection (Megaplay, Vidstream, ACDN), and Sub/Dub audio switching.
* **⚡ Native HLS & MPEG-TS Download Engine**:
  * Concurrent segment downloads (up to 6 parallel connections per download).
  * Safe **in-memory AES-128 decryption** (keys are never written to disk).
  * Automated WebVTT/ASS subtitle downloading and `.srt` transcoding beside the video file.
  * Resilient atomic download queue with automatic interrupt resumption and corruption recovery.
* **📁 Offline Library**: Downloaded episodes (`.ts`) are indexed and playable directly within the application with zero network connection.
* **⏸️ Auto-Pause Behavior**: Configurable `pauseOnClose` setting that automatically pauses playback when the window is minimized or loses focus, plus system sleep/lock detection.
* **🎧 Discord Rich Presence**: Real-time rich presence synchronization displaying your active show, episode number, and playback timestamp on Discord.
* **🌐 Web Portal Integration**: One-click toggle between Standalone Desktop UI and the Cloud Web Portal (`https://zenkai-web.pages.dev/`) with hotkeys (`Ctrl+Shift+D` and `Ctrl+Shift+W`).
* **🔒 Enterprise Security**: Deny-by-default navigation, strict Content Security Policy (CSP), origin allowlisting, zero Node/Electron leakage in renderer, and sanitized deep links.

---

## 🏛️ Application Architecture

Zenkai Desktop follows a decoupled, three-tier modular architecture:

```
zenkai-desktop/
├── src/
│   ├── main/                    # Desktop Backend & Native Engine (Main Process)
│   │   ├── api/                 # Typed API client, Stream Resolver, Guarded Proxy
│   │   │   ├── client.ts        # Rate-limited HTTP client (max 4 concurrent, retry logic)
│   │   │   ├── routes.ts        # /api/stream, /api/mapping, /api/subtitles endpoints
│   │   │   ├── stream.ts        # m3u8 playlist resolver & allowedHosts compiler
│   │   │   └── proxy.ts         # Guarded CDN proxy fetcher with MPEG-TS validation
│   │   ├── downloads/           # Native Download & Decryption Pipeline
│   │   │   ├── hls.ts           # Master/media playlist parser & variant selection
│   │   │   ├── hls-download.ts  # In-memory AES-128 decryption & segment streaming
│   │   │   ├── manager.ts       # Download queue manager, index persistence & resume
│   │   │   └── subtitles.ts     # Subtitle fetching & WebVTT/ASS -> SRT converter
│   │   ├── ipc/                 # Zod-validated IPC Handlers
│   │   │   ├── downloads.ipc.ts # start, resolve, list, remove
│   │   │   ├── settings.ipc.ts  # get, set
│   │   │   ├── rpc.ipc.ts       # set, clear
│   │   │   └── app.ipc.ts       # version
│   │   ├── discord-rpc.ts       # Discord RPC presence client
│   │   ├── menu.ts              # Native application menu & accelerators
│   │   ├── notify.ts            # Native OS notification dispatcher
│   │   ├── playback.ts          # Window focus/blur playback listeners
│   │   ├── power.ts             # OS suspend/lock screen hooks
│   │   ├── protocol.ts          # Single-instance lock & zenkai:// deep linking
│   │   ├── security.ts          # Navigation lockdown & CSP enforcement
│   │   ├── settings.ts          # Atomic settings store with .bak fallback
│   │   ├── tray.ts              # System tray integration
│   │   ├── updater.ts           # electron-updater GitHub provider
│   │   ├── window.ts            # Hardened BrowserWindow factory
│   │   └── index.ts             # Electron application lifecycle entry point
│   │
│   ├── preload/                 # Secure Context Bridge (IPC Boundary)
│   │   └── index.ts             # Exposes typed window.zenkai API with contextIsolation
│   │
│   ├── renderer/                # Client-Side Standalone Application (Renderer)
│   │   ├── index.html           # Accessible semantic markup with CSP meta tags
│   │   └── src/
│   │       ├── styles.css       # Obsidian & Claymorphic CSS design system
│   │       ├── main.ts          # Frontend application controller, HLS player & views
│   │       └── env.d.ts         # Preload bridge TypeScript declarations
│   │
│   └── shared/                  # Common TypeScript Contracts & Types
│       ├── api-types.ts         # Verbatim upstream API schema contracts
│       ├── config.ts            # Origins, URLs, barrier tokens, and constants
│       ├── ipc-contract.ts      # Strongly-typed IPC contract & event map
│       └── settings.schema.ts   # Zod schema for persistent settings
│
├── .github/workflows/
│   ├── ci.yml                   # Ubuntu PR gate: frozen lockfile, typecheck, lint, test, e2e
│   └── release.yml              # 3-OS Matrix (Ubuntu, Windows, macOS) automated publisher
├── release/                     # Packaged installable distributions (AppImage, deb, nsis, dmg)
└── tests/
    ├── unit/                    # 11 Vitest unit test suites (66 tests)
    └── e2e/                     # Playwright-for-Electron end-to-end integration tests
```

---

## 🛠️ Development & Building from Source

### Prerequisites
* **Node.js**: `v22.x` or higher
* **Package Manager**: `pnpm` (v12 recommended)
* **Linux Build Dependencies**: `libnotify-bin`, `libnotify-dev`, `rpm` (for RPM builds)

### 1. Installation
```bash
git clone https://github.com/johan-droid/Zenkai-Desktop-.git
cd Zenkai-Desktop-
pnpm install
```

### 2. Development Mode
Run the Electron app with hot-module replacement (HMR):
```bash
pnpm dev
```

### 3. Verification & Testing
```bash
# Typecheck TypeScript (strict mode)
pnpm typecheck

# Run linter
pnpm lint

# Run all 66 Vitest unit tests
pnpm test

# Run Playwright E2E tests (in virtual framebuffer on Linux)
xvfb-run -a pnpm e2e
```

### 4. Build & Package
```bash
# Compile TypeScript and bundle with electron-vite
pnpm build

# Package for Linux (AppImage & deb)
pnpm dist:linux

# Package for Windows (NSIS & portable)
pnpm dist:win

# Package for macOS (DMG & zip universal)
pnpm dist:mac
```

---

## 🚀 Deploying to GitHub

To publish releases automatically via GitHub Actions:

1. **Initialize Git Remote**:
   ```bash
   git remote add origin https://github.com/johan-droid/Zenkai-Desktop-.git
   git add .
   git commit -m "feat: complete Zenkai Desktop standalone application"
   git branch -M main
   git push -u origin main
   ```

2. **Trigger an Automated Multi-Platform Release**:
   Tagging a commit with `v*` will trigger `.github/workflows/release.yml`, building and uploading release binaries for Linux, Windows, and macOS simultaneously:
   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```

3. **Release Artifacts Created by CI**:
   * `Zenkai-0.0.1.AppImage` (Linux x64, arm64)
   * `zenkai-desktop_0.0.1_amd64.deb` / `zenkai-desktop_0.0.1_arm64.deb`
   * `zenkai-desktop-0.0.1.x86_64.rpm` / `zenkai-desktop-0.0.1.aarch64.rpm`
   * `Zenkai-Setup-0.0.1.exe` / `Zenkai-0.0.1-portable.exe` (Windows)
   * `Zenkai-0.0.1-universal.dmg` / `Zenkai-0.0.1-mac.zip` (macOS)

---

## ⚙️ Environment Flags

| Variable | Description | Default |
|---|---|---|
| `ZENKAI_MODE` | Set to `web` to boot directly into Cloud Web mode | `standalone` |
| `ZENKAI_WEB_URL` | Override the target web URL (used in E2E tests) | `https://zenkai-web.pages.dev/` |
| `ZENKAI_API_BASE` | Primary API server base URL | `https://zenkai-web.pages.dev` |
| `ZENKAI_API_FALLBACK_BASE` | Fallback API server base URL | `https://zenkaii.pages.dev` |
| `ZENKAI_DISCORD_APP_ID` | Discord Application Client ID for Rich Presence | Optional (gracefully disabled if unset) |
| `ZENKAI_BARRIER` | Upstream barrier authentication token | `zenkai-barrier-apk-2026-v1` |

---

## 📜 Disclaimer

Zenkai Desktop does not host any media files on its servers. All streams and subtitles are resolved via third-party providers. The software is provided under the terms of the project's license.
