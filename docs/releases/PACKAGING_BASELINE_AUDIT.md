# Zenkai Desktop — Packaging Baseline & Readiness Audit

**Document Version:** 1.0.0  
**Target Release:** Zenkai Desktop v0.0.1  
**Target Architectures:** Linux x86_64 (AppImage), Windows x64 (NSIS Installer)  
**Status:** Certified Baseline

---

## 1. Executive Summary

This audit assesses the packaging baseline of Zenkai Desktop, identifying runtime dependencies, binary asset requirements, IPC boundaries, ASAR integrity, and platform-specific installer constraints. The goal is delivering lean, production-grade, reproducible distributables without test artifacts, mock data, or development dependencies.

---

## 2. Packaging Architecture & Toolchain

| Component | Specification | Function |
|---|---|---|
| **Host Environment** | Linux x86_64 (Kernel 7.2 / Ubuntu-compatible) | Packaging & cross-target toolchain |
| **Electron Runtime** | Electron v45.3.2 | Production desktop container |
| **Build Orchestrator** | `electron-vite` v6.0.0 | Vite-powered bundling for main, preload, renderer |
| **Packager** | `electron-builder` v26.18.0 | ASAR packaging, installer generation, target emission |
| **Package Manager** | `pnpm` v10.x | Deterministic workspace & dependency isolation |
| **Main Process Entry** | `out/main/index.js` | Electron lifecycle, IPC handlers, native bridging |
| **Preload Script** | `out/preload/index.js` | Context isolation bridge (`contextBridge.exposeInMainWorld`) |
| **Renderer Process** | `out/renderer/index.html` + `assets/` | React 19 SPA with Tailwind CSS v4, HashRouter |

---

## 3. Dependency Inventory & Classification

### 3.1 Main Process Runtime Dependencies
These modules are strictly required at runtime by `out/main/index.js`:
- `electron` (provided by Electron binary distribution)
- `node:*` (`fs`, `path`, `crypto`, `child_process`, `os`, `stream`, `events`, `util`, `url`)
- `onnxruntime-node` (v1.31.1): Hardware-accelerated neural network inference backend for Zenkai Vision. Requires native C++ bindings (`onnxruntime_binding.node`, `libonnxruntime.so.1`, `onnxruntime.dll`, `DirectML.dll`).
- `@xhayper/discord-rpc` (v1.5.1): IPC-based Discord Rich Presence client.
- `electron-updater` (v6.8.11): Differential auto-update client with GitHub Releases provider.
- `zod` (v4.6.7): Schema validation for configuration and IPC payload serialization.

### 3.2 Renderer Process Bundled Dependencies
These dependencies are fully bundled into static JavaScript/CSS chunks by `electron-vite build` and **do not require runtime node_modules resolution**:
- `react` / `react-dom` (v19.3.1)
- `react-router-dom` (v7.18.5, operating in HashRouter mode for `file://` scheme compatibility)
- `framer-motion` (v14.14.0)
- `lucide-react` (v1.73.0)
- `hls.js` (v1.7.4)
- `qrcode.react` (v4.2.0)
- `@supabase/supabase-js` (v2.119.0)
- `anime4k-webgpu` (v1.0.0)
- `falling-snow` (v1.0.0)

### 3.3 Development Dependencies (Excluded from Packages)
- `@playwright/test`, `vitest`, `eslint`, `prettier`, `typescript`, `@types/*`
- Build scripts (`scripts/t*-check.mjs`, `scripts/capture-real-screenshots.mjs`)
- Unit and E2E test suites (`tests/`)

---

## 4. Native Binary & ASAR Configuration

### 4.1 Native Addons
`onnxruntime-node` contains platform-dependent precompiled shared libraries and `.node` N-API modules:
- **Linux x64:** `node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node` + `libonnxruntime.so.1`
- **Windows x64:** `node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node` + `onnxruntime.dll` + `DirectML.dll`

### 4.2 ASAR Unpack Policy
Node.js `process.dlopen` cannot load dynamic shared libraries directly from within an ASAR archive. Consequently:
- `asar: true` is enforced for code confidentiality and filesystem read speed.
- `asarUnpack` automatically extracts:
  - `**/*.node`
  - `node_modules/onnxruntime-node/**`
- Verified: Extracted files reside in `app.asar.unpacked/node_modules/onnxruntime-node/bin/...` adjacent to `app.asar`, guaranteeing proper dynamic linker discovery.

---

## 5. Platform-Specific Distributable Profiles

### 5.1 Linux Distributable: AppImage (`x86_64`)
- **Self-contained execution:** Runs across modern Linux distributions (Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux, Pop!_OS) without requiring global dependencies.
- **Desktop Integration:**
  - `Desktop Entry` with `StartupWMClass=zenkai.desktop`
  - High-resolution SVG and PNG icons (`resources/icon.png`, 512x512)
  - AudioVideo / Video / Player categorization
  - Associated MIME types (`video/mp4`, `video/x-matroska`, `application/x-zenkai`)
- **Execution Mode:** Direct portable execution (`chmod +x Zenkai-Desktop-0.0.1-x86_64.AppImage && ./...`).

### 5.2 Windows Distributable: NSIS Installer (`x64`)
- **Installer Type:** NSIS 2-page or standard wizard installer (`oneClick: false`).
- **User Choice:** User-selectable installation directory (`allowToChangeInstallationDirectory: true`). Default: `%LOCALAPPDATA%\Programs\Zenkai`.
- **Shortcuts:** Automatic Desktop shortcut and Start Menu program group.
- **Metadata:** Embedded Windows PE resources (`Zenkai.exe`), Version 0.0.1.0, icon `resources/icon.ico`.
- **Uninstaller:** Clean registry removal (`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Zenkai Desktop`) and complete executable removal without wiping user data (`%APPDATA%\Zenkai`).

---

## 6. Audit Verdict
The baseline architecture is validated:
- Zero build errors.
- Unpacked Linux binary boots and operates cleanly without errors.
- Unpacked Windows PE binary generates with valid ASAR integrity checksums.
- Zero mock data or test harnesses present in production paths.
