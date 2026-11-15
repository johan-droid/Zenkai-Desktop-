# Changelog

All notable changes to the **Zenkai Desktop** application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.0.1] - 2026-11-15

### Initial Release — Standalone Architecture, Secure HLS Engine & Multi-Platform Packaging

This is the inaugural release of **Zenkai Desktop**, transitioning from a web-wrapper concept into a complete, high-performance, standalone desktop client for anime streaming, offline downloading, and watch tracking.

### Added
* **Standalone Desktop Interface**:
  * AniList GraphQL live discovery engine with real-time trending titles, season populars, and genre filters.
  * Resilient offline catalog fallback ensuring the interface is navigable even with zero internet connectivity.
  * Custom claymorphic & obsidian dark theme optimized for desktop viewports.
* **Integrated Streaming Player**:
  * Hardware-accelerated `hls.js` video playback engine with adaptive bitrate streaming.
  * Multi-server resolution supporting primary and fallback stream providers.
  * Picture-in-Picture (PiP) mode and fullscreen support.
  * Audio track selection (Sub / Dub switching) and integrated subtitle overlay.
* **Native HLS & MPEG-TS Download Pipeline**:
  * Multi-connection concurrent segment downloading (up to 6 parallel connections per download job).
  * Safe **in-memory AES-128 decryption** — decryption keys and initialization vectors are processed strictly in RAM and never written to persistent disk.
  * Automated WebVTT/ASS subtitle downloading with instant transcoding into standard `.srt` format saved beside media files.
  * Persistent download queue with atomic index management, pause/resume, cancellation, and corrupt segment recovery.
* **Offline Media Library**:
  * Local media player capable of loading and playing stored `.ts` video files directly with accompanying `.srt` subtitles.
  * Disk usage monitoring and one-click file removal from the local library.
* **Native Desktop Integrations**:
  * Real-time **Discord Rich Presence (RPC)** reporting the current anime title, episode number, and live elapsed playback time.
  * System tray integration with quick actions (Show/Hide, Pause/Resume, Quit).
  * Native OS desktop notifications for download completion and playback alerts via `libnotify` (Linux) and Windows Action Center.
  * Configurable auto-pause functionality triggered on window minimize, focus loss, screen lock, or system suspend.
  * Single-instance application lock with `zenkai://` deep linking protocol handler.
* **Cloud Web Portal Toggle**:
  * Dual-mode architecture supporting both local standalone operation and cloud portal web view (`https://zenkai-web.pages.dev/`).
  * Keyboard shortcuts (`Ctrl+Shift+D` for Standalone Desktop UI, `Ctrl+Shift+W` for Web Portal).

### Security
* **Strict Navigation Lockdown**: All external HTTP/HTTPS hyperlinks are intercepted and forced to open safely in the user's default system browser.
* **Hardened Content Security Policy (CSP)**: Disallows `unsafe-eval` and unauthorized script injections.
* **Context Isolation & Zero Leakage**: The renderer process is strictly sandboxed with `nodeIntegration: false` and `contextIsolation: true`. Zero Electron or Node.js internal APIs are exposed to the DOM.
* **Zod-Validated IPC Boundary**: All Inter-Process Communication channels enforce strict runtime type and schema validation via Zod schemas.

### Packaging & Release
* **Windows Distributions (x64)**:
  * `Zenkai-Desktop-v0.0.1-Windows-x64-Setup.exe`: Full NSIS installer with start menu shortcut, desktop icon, and clean uninstaller.
  * `Zenkai-Desktop-v0.0.1-Windows-x64-Portable.zip`: Zero-install portable archive with standalone `Zenkai.exe`.
* **Linux Distributions (x64)**:
  * `Zenkai-Desktop-v0.0.1-Linux-x64.AppImage`: Self-contained portable executable with integrated desktop metadata.
  * `Zenkai-Desktop-v0.0.1-Linux-x64.deb`: Debian / Ubuntu native package registering `/usr/share/applications/zenkai.desktop` and hicolor icons.
  * `Zenkai-Desktop-v0.0.1-Linux-x64.rpm`: Red Hat / Fedora / openSUSE native package.
* **Automated CI/CD Release Pipeline**:
  * GitHub Actions matrix workflow generating Windows, Linux, and macOS builds independently.
  * Automated `SHA256SUMS.txt` cryptographic checksum verification for every release asset.

---

