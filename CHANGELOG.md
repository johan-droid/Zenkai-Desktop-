# Changelog

All notable changes to the **Zenkai Desktop** application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Official Trademark Logo Integration**: Embedded authentic Zenkai 512x512 trademark logo and OpenMoji character assets into the application bundle (`src/renderer/src/assets/logo.ts`, `DesktopSidebar`, `Logo`, `LogoFill`, `ExtensionPage`), eliminating missing asset errors and blank placeholder boxes on `file://` desktop runtimes.
- **Native OS Packaging Brand Assets**: Replaced placeholder blue squares in `scripts/gen-icons.mjs` and `scripts/gen-tray-icon.mjs` with genuine multi-resolution asset pipelines producing authentic `resources/icon.png`, `resources/icons/*`, `resources/icon.ico`, `resources/icon.icns`, and `resources/tray.png`.
- **Production README Documentation Overhaul**: Rebuilt `README.md` with official trademark branding header, application architecture diagrams, real application showcase screenshots, and verified setup instructions.
- **Scraped Home & Catalog Fallback Dataset**: Bundled authentic pre-scraped home and catalog dataset (`src/renderer/src/data/fallback-home.json` and `public/home-data.json`) via `scripts/scrape-zenkai-home.mjs`, ensuring discovery shelves and hero carousels remain populated during upstream API rate limits or network outages.
- **Outbound API Header Normalization**: Added `onBeforeSendHeaders` interceptor in `src/main/security.ts` to attach genuine web origin and user-agent headers to AniList, Kitsu, Jikan, and TMDB queries from the desktop runtime.
- **Desktop Shield Exemption**: Updated `src/renderer/src/lib/shield.ts` to recognize the native desktop runtime (`window.zenkai` / `file://`), preventing false-positive headless bot locks and 403 "Automated Access Denied" errors in desktop automation and testing.
- **Authentic Application Showcase Captures**: Captured high-resolution screenshots (`docs/screenshots/`) directly from the populated desktop application displaying real anime titles, hero carousel, catalog shelves, manga, and movies.
- **Desktop & Updates Settings Hub**: Integrated desktop-specific configuration panel inside `ProfilePage.tsx` with release channel switching (`stable` vs `beta`), manual update checks, and download storage folder opener.
- **Playback Health Center**: Real-time diagnostic latency probes to AniList GraphQL API, GitHub Releases, and Cloud CDN.

---

## [0.0.2] - 2026-11-15

### Major Milestone — Authentic React 19 Engine Integration, Dual-Track Updates & Playback Protection

### Added
* **Authentic React 19 WebApp Integration**:
  * Direct integration of the authentic production frontend from `nyyrox2/Zenkai` into the standalone Electron client.
  * Over 36 complete pages and 113 UI components including `DesktopSidebar`, `MobileDock`, and `DiscoverHero`.
  * **CinePlayer Playback Engine**: Multi-server streaming (MegaPlay, Vidstream, FlixCloud, AnimeSalt, ACDN) with instant failover.
  * **WebGPU Neural Upscaler**: Hardware-accelerated Anime4K GLSL/WGSL shader pipeline running locally on the desktop GPU.
  * **Advanced Subtitle Engine**: OctoSub / JSSubtitles WebGL parser supporting ASS/SSA styled karaoke, positioning, and font styling, alongside SRT/VTT.
  * **Multi-Track Audio**: Native sub and dub stream switching directly in the player.
  * **Manga & Novel Readers**: Continuous vertical webtoon scroll, single/double page reading, chapter caching, and EPUB/text reading progress synchronization.
  * **Movies & TV Series**: TMDB catalog integration with season/episode browsing.
* **Dual-Track Update Management Engine**:
  * **Track A (Over-The-Air Frontend Updates)**: Independent renderer updates without requiring full desktop reinstalls, verified via SHA-256 integrity checks.
  * **5-Second Canary Health Check & Rollback**: OTA updates are monitored for 5 seconds after window creation; any crash or fatal load failure triggers an automatic rollback to the known-good previous build or the bundled offline fallback.
  * **Track B (Native Runtime Updates)**: Differential update delivery via `electron-updater` (Windows NSIS / Linux AppImage) and direct one-click downloads for Linux native packages (`.deb` / `.rpm`) into the user's `Downloads` folder.
  * **Active Playback Guard**: Zero-interruption invariant; suppresses intrusive popups, background bandwidth consumption, and application restarts while video playback is active.
* **Anti-Cross-Title Deterministic Identity Resolution**:
  * Canonical AniList ID mapping (`public/anime-mapping.json` & `server/mapping.js`) preventing cross-title stream pollution across disparate upstream provider scrapers.
  * Title integrity validation in stream resolver discarding corrupted or mismatched episode streams.

### Fixed
* Fixed cross-title playback mix-ups where disparate provider IDs returned wrong show streams.
* Resolved Electron singleton lock collisions during headless testing.
* Fixed WebGPU types and TypeScript ambient declarations for Vite production builds.

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

