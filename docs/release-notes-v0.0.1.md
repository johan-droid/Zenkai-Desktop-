# Zenkai Desktop v0.0.1 — Release Notes

**Release Date:** November 15, 2026  
**Tag:** `v0.0.1`  
**Git Commit / Branch:** `release/desktop-packaging-and-documentation`  

---

## 🌟 Highlights

We are thrilled to announce the inaugural public release of **Zenkai Desktop v0.0.1**! 

Zenkai Desktop brings high-performance, distraction-free anime streaming, offline downloading, and watch tracking directly to your desktop. Moving far beyond a standard web wrapper, Zenkai Desktop incorporates a decoupled Electron architecture, a standalone client interface powered by AniList GraphQL discovery, an in-memory AES-128 HLS decrypting download pipeline, and deep desktop OS integrations.

---

## 🚀 Key Features in v0.0.1

* **Standalone Client Interface**:
  * Live AniList GraphQL discovery with real-time trending titles, seasonal anime, and ratings.
  * Resilient offline catalog fallback ensuring the interface is navigable with zero internet connection.
  * Custom claymorphic & obsidian dark theme tailored for desktop window managers.
* **Integrated Streaming Player**:
  * Hardware-accelerated `hls.js` video playback engine with adaptive bitrate streaming (1080p / 720p / 480p / 360p).
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

---

## 🔒 Security & Privacy

* **Strict Sandboxing**: The renderer runs with `nodeIntegration: false`, `contextIsolation: true`, and zero Node.js/Electron leakage.
* **Deny-by-Default Navigation**: Off-origin navigation is strictly blocked; external URLs automatically open in the user's default system browser.
* **Zod-Validated IPC**: Every message crossing the preload context bridge is strictly validated against TypeScript/Zod schemas.

---

## 📦 Download Assets & Checksums

| Asset Name | Platform | Target Architecture | Description |
|---|---|---|---|
| `Zenkai-Desktop-v0.0.1-Windows-x64-Setup.exe` | Windows 10/11 | x64 (64-bit) | Interactive NSIS installer with Start Menu & Desktop shortcuts. |
| `Zenkai-Desktop-v0.0.1-Windows-x64-Portable.zip` | Windows 10/11 | x64 (64-bit) | Zero-install standalone archive. Extract and run `Zenkai.exe`. |
| `Zenkai-Desktop-v0.0.1-Linux-x64.AppImage` | Linux | x64 (64-bit) | Standalone portable executable. Compatible with all major Linux distros. |
| `Zenkai-Desktop-v0.0.1-Linux-x64.deb` | Ubuntu / Debian | x64 (64-bit) | Native `.deb` package with desktop menu integration. |
| `Zenkai-Desktop-v0.0.1-Linux-x64.rpm` | Fedora / RHEL | x64 (64-bit) | Native `.rpm` package with desktop menu integration. |
| `SHA256SUMS.txt` | All | All | Authoritative SHA-256 cryptographic checksums. |

### Cryptographic Verification

Verify the integrity of downloaded assets using standard SHA-256 tools:

```bash
# On Linux / macOS:
sha256sum -c SHA256SUMS.txt --ignore-missing

# On Windows (PowerShell):
Get-FileHash -Algorithm SHA256 Zenkai-Desktop-v0.0.1-Windows-x64-Setup.exe
```

---

## ⚠️ Known Limitations & Caveats

1. **Code Signing Certificates**: Release binaries for Windows are signed with SHA-256 self-sign hashing options. Because they do not yet carry an EV certificate, Windows Defender SmartScreen may display a one-time "Windows protected your PC" prompt on first launch. Click **More info** > **Run anyway**.
2. **Windows ARM64**: ARM64 Windows devices are not officially certified for this release. x64 builds will run under Windows on ARM emulation.
3. **Linux Notifications**: Desktop notification dispatch requires a standard Freedesktop notification daemon (e.g. `dunst`, `mako`, `xfce4-notifyd`, or GNOME/KDE built-in).

---

## 👏 Acknowledgements & Credits

* **Nyyrox / Zenkai**: Upstream core architecture and vision for the Zenkai anime ecosystem.
* **AniList API**: Anime metadata and media discovery GraphQL services.
* **Hls.js Team**: Robust JavaScript HLS client for HTML5 video playback.
* **Electron & electron-builder**: Desktop application runtime and packaging infrastructure.
