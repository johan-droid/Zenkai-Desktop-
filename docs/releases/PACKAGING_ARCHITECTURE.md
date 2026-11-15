# Zenkai Desktop — Packaging Architecture Specification

**Document Version:** 1.0.0  
**Target Release:** Zenkai Desktop v0.0.1  
**Author:** Zenkai Engineering Release Team  
**Status:** Canonical Reference

---

## 1. Architectural Overview

Zenkai Desktop is distributed as a hardened, production-isolated desktop application. The packaging architecture decouples runtime requirements across three tiers:
1. **Host Executable Container:** Native Electron runtime binary (`zenkai-desktop` on Linux ELF, `Zenkai.exe` on Windows PE32+).
2. **Encapsulated Application Archive (`app.asar`):** Read-only archive containing the compiled main process entry point, preload bridge, bundled renderer static assets, and necessary production libraries.
3. **Unpacked Native Binary Extension (`app.asar.unpacked`):** Native C++ Node addons (`.node`) and operating system shared libraries (`.so`, `.dll`) extracted outside ASAR to allow operating system dynamic linkers (`dlopen` / `LoadLibraryExW`) direct memory-mapped access.

```
Distribution Package Root
├── app.asar                     <-- Cryptographically verified read-only archive
│   ├── out/main/index.js        <-- Main process controller
│   ├── out/preload/index.js     <-- Context isolation bridge
│   ├── out/renderer/            <-- Pure static web bundle (HTML/CSS/JS/WebP)
│   └── node_modules/            <-- Production dependencies only
├── app.asar.unpacked/           <-- Extracted native addons
│   └── node_modules/onnxruntime-node/bin/
│       ├── linux/x64/           <-- libonnxruntime.so.1 + onnxruntime_binding.node
│       └── win32/x64/           <-- onnxruntime.dll + DirectML.dll + onnxruntime_binding.node
├── resources/
│   ├── tray.png                 <-- High-DPI system tray indicator
│   └── app-update.yml           <-- GitHub Releases update configuration
└── electron / zenkai-desktop    <-- Base runtime binary
```

---

## 2. ASAR Configuration & Code Signing Integrity

### 2.1 ASAR Archive Packing
- `asar: true` is explicitly configured in `electron-builder.yml`.
- All development assets, test suites (`tests/`), fixtures, TypeScript configuration, source maps, and markdown docs are excluded from `app.asar`.
- ASAR Integrity hashes are computed via SHA-256 and embedded directly into the executable header (`Zenkai.exe` on Windows; ELF resource on Linux).
- Any runtime tampering or byte modification of `app.asar` causes the Electron runtime to terminate immediately before script evaluation.

### 2.2 Native Binary Unpack Mechanics (`asarUnpack`)
Because the dynamic linker cannot read binary symbols through the ASAR virtual filesystem:
- `asarUnpack: ["**/*.node", "node_modules/onnxruntime-node/**"]` guarantees that:
  - ONNX Runtime execution providers (CPU EP, DirectML EP, CUDA EP) load directly from the physical filesystem.
  - Native symbols resolve deterministically without extracting to temporary directories at runtime.

---

## 3. Platform Distribution Schemes

### 3.1 Linux — AppImage (`x86_64`)
- **Format:** Type 2 AppImage container compressed with runtime squashfs.
- **Payload:** Bundles the full Electron runtime, Chromium compositor, SwiftShader Vulkan fallbacks, native ONNX Runtime binaries, and Zenkai Desktop assets.
- **Desktop Entry Integration (`zenkai.desktop`):**
  ```ini
  [Desktop Entry]
  Name=Zenkai Desktop
  Exec=zenkai-desktop %U
  Terminal=false
  Type=Application
  Icon=zenkai-desktop
  StartupWMClass=zenkai.desktop
  Comment=Production Desktop Shell for Zenkai Streaming & AI Video Enhancement
  Categories=AudioVideo;Video;Player;TV;
  MimeType=x-scheme-handler/zenkai;video/mp4;video/x-matroska;video/quicktime;video/webm;
  ```
- **Execution Lifecycle:**
  1. User runs `chmod +x Zenkai-Desktop-0.0.1-x86_64.AppImage`.
  2. AppImage runtime mounts squashfs container via FUSE to `/tmp/.mount_ZenkaiXXXXXX`.
  3. `AppRun` executes the packaged `zenkai-desktop` binary with isolated environment variables.
  4. User configuration and downloads are stored in `~/.config/Zenkai/` and `~/.local/share/Zenkai/` (never inside the read-only mount).

### 3.2 Windows — NSIS Installer (`x64`)
- **Format:** Nullsoft Scriptable Install System (NSIS) Unicode installer (`Zenkai-Desktop-Setup-0.0.1-x64.exe`).
- **Mode:** Dual-mode installation (Per-User non-admin by default to `%LOCALAPPDATA%\Programs\Zenkai`, with optional elevation).
- **Customization:** User can select a custom target directory.
- **Registry Integration:**
  - `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Zenkai Desktop`
  - URL Protocol registration: `zenkai://` mapped to `"%LOCALAPPDATA%\Programs\Zenkai\Zenkai.exe" "%1"`.
- **Shortcuts:** Desktop shortcut and Start Menu shortcut with high-resolution multi-size Windows icon (`icon.ico` with 16x16, 32x32, 48x48, 64x64, 128x128, 256x256 mipmaps).

---

## 4. Security Architecture

1. **Context Isolation:** `contextIsolation: true` is strictly enforced. The renderer process has zero direct access to Node.js globals, `process`, `Buffer`, or `require`.
2. **Preload Sealing:** Preload API is exposed via `contextBridge.exposeInMainWorld("zenkai", zenkaiApi)`. All IPC channels are strictly whitelisted and type-validated with Zod schemas.
3. **Sandbox:** Chromium renderer sandbox is enabled (`sandbox: true`).
4. **Content Security Policy & Iframe Sandboxing:** All third-party video embeds run inside sandboxed iframes (`sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"`).
5. **Protocol Isolation:** Deep link handler parses `zenkai://` URLs with strict URL validation, rejecting any attempt to inject shell command flags.

