# ⚡ Zenkai Desktop v0.0.1 — Inaugural Production Release

We are thrilled to announce the official inaugural production release of **Zenkai Desktop (v0.0.1)**!

Zenkai Desktop delivers a high-fidelity, distraction-free anime streaming, manga reading, and offline downloading experience built as a standalone desktop client. Powered by an authentic React 19 engine running inside a secured Electron container, Zenkai Desktop features **Zenkai Vision** (local GPU-accelerated AI video upscaling), an in-memory AES-128 decrypting download engine, and deep OS desktop integrations.

---

## 🌟 Major Highlights

### 🎬 Authentic React 19 Frontend (36 Pages)
- **Full-featured interface**: Discover Hero spotlights, seasonal anime grids, detailed character bios, manga/novel readers, and desktop settings.
- **Resilient Offline Fallback**: Bundled authentic catalog and home data ensures zero blank screens or 403 errors during upstream network hiccups or rate limits.
- **Search Modal (`Ctrl+K`)**: Rapid debounced title search across thousands of series with keyboard navigation.

### 🔮 Zenkai Vision — GPU-Accelerated AI Video Enhancement
- **Live Playback Upscaling**: WebGPU-powered Anime4K shader pipeline integrated directly into the player with dynamic before/after split-screen comparison slider.
- **Hardware-Aware Detection**: Real-time detection and utilization of NVIDIA (CUDA), AMD (ROCm / DirectML), Intel (oneAPI / DirectML), and optimized CPU fallbacks without simulated metrics.
- **Vision Studio (`/vision`)**: Offline AI enhancement pipeline with tiled processing up to 8K output and zero out-of-memory crashes.

### 📥 Concurrent HLS Download Engine & Offline Library
- **Dedicated Downloads Center (`/downloads`)**: Browse, pause, resume, and manage your downloaded anime collection directly from the sidebar.
- **Safe In-Memory Decryption**: AES-128 stream decryption keys are processed strictly in RAM and never saved to persistent disk.
- **Integrated Subtitle Extraction**: Automatically fetches and embeds `.srt` subtitles side-by-side with media files.

### 🖥️ Native Desktop Integrations
- **Discord Rich Presence (RPC)**: Automatically broadcasts your current anime title, episode number, and elapsed playback time to Discord.
- **Active Playback Guard**: Zero-interruption policy that suppresses intrusive update prompts and background tasks while media is playing.
- **Auto-Pause on Minimize/Lock**: Intelligently pauses video playback when the application window is minimized, hidden, or the screen locks.
- **System Tray & Hotkeys**: Background minimization with quick tray actions (Play/Pause, Show/Hide, Quit).
- **Deep-Link Protocol (`zenkai://`)**: Seamless single-instance application lock and browser-to-desktop authentication routing.

---

## 📦 Downloads & Cryptographic Checksums

| Platform | Format | Asset Name | Size | SHA-256 Checksum |
|---|---|---|---|---|
| **Linux** | Standalone AppImage (`x86_64`) | `Zenkai-Desktop-0.0.1-x86_64.AppImage` | **187 MB** | `16cf472e5e88550a2104b386cf530ed9ff16be33883ce05d30b14baf054dd79a` |
| **Windows** | NSIS Setup Wizard (`x64`) | `Zenkai-Desktop-Setup-0.0.1-x64.exe` | **213 MB** | `9f4a2947d2a7ccd5008cd593254d0a54844b1926a47dcdecc7b3cca0b2a59e86` |

*Authoritative checksums are also provided in `SHA256SUMS.txt`.*

---

## 🚀 Quick Installation Guide

### Linux (AppImage)
1. Download `Zenkai-Desktop-0.0.1-x86_64.AppImage`.
2. Make it executable:
   ```bash
   chmod +x Zenkai-Desktop-0.0.1-x86_64.AppImage
   ```
3. Run the AppImage:
   ```bash
   ./Zenkai-Desktop-0.0.1-x86_64.AppImage
   ```
*(Compatible with Ubuntu 20.04+, Pop!_OS, Debian 11+, Fedora 34+, Arch Linux, and other modern distributions).*

### Windows (Setup EXE)
1. Download `Zenkai-Desktop-Setup-0.0.1-x64.exe`.
2. Run the installer wizard and choose your preferred installation directory (Default: `%LOCALAPPDATA%\Programs\Zenkai`).
3. Launch **Zenkai Desktop** from your Desktop shortcut or Start Menu.

> **Note on Windows SmartScreen:** Because this is an initial open-source release without an expensive EV enterprise signing certificate, Windows Defender SmartScreen may display a "Windows protected your PC" alert on first launch. Click **More info** → **Run anyway**. You can verify the official SHA-256 hash above prior to running.

---

## 🔐 Verify Checksums

### Linux:
```bash
sha256sum Zenkai-Desktop-0.0.1-x86_64.AppImage
# Expected: 16cf472e5e88550a2104b386cf530ed9ff16be33883ce05d30b14baf054dd79a
```

### Windows (PowerShell):
```powershell
Get-FileHash -Algorithm SHA256 .\Zenkai-Desktop-Setup-0.0.1-x64.exe
# Expected: 9f4a2947d2a7ccd5008cd593254d0a54844b1926a47dcdecc7b3cca0b2a59e86
```

---

## 📚 Technical Documentation & Audits

- [Installation & User Guide](docs/releases/INSTALLATION_GUIDE.md)
- [Packaging Architecture Specification](docs/releases/PACKAGING_ARCHITECTURE.md)
- [Zero-Mock & Production Data Integrity Audit](docs/releases/PRODUCTION_DATA_INTEGRITY_AUDIT.md)
- [Uninstallation & Data Preservation Architecture](docs/releases/UNINSTALL_AND_DATA_PRESERVATION.md)
- [Building & Packaging from Source](docs/releases/BUILDING.md)
- [Release Quality Gates Verification Checklist](docs/releases/RELEASE_CHECKLIST.md)

---

## ❤️ Credits & Acknowledgements
- **AniList API**: Anime metadata, media relations, and GraphQL services.
- **Hls.js**: Adaptive bitrate streaming engine.
- **ONNX Runtime & DirectML**: Hardware-accelerated neural network inference.
- **Electron & electron-builder**: Modern cross-platform runtime and packaging engine.
