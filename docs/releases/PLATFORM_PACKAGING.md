# Zenkai Desktop — Multi-Platform Packaging Architecture

**Document Version:** 1.0.0  
**Scope:** Packaging configurations, native dependencies, code signing, and distribution formats.

---

## 1. Supported Platform Targets

Zenkai Desktop builds native distribution packages for Linux, Windows, and macOS:

| Target OS | Target Architecture | Package Format | Output Location | Packaging Engine |
|---|---|---|---|---|
| **Linux** | `x86_64` (amd64) | AppImage (`.AppImage`), Debian (`.deb`), RPM (`.rpm`) | `dist/linux/` | `electron-builder` |
| **Linux** | `aarch64` (arm64) | AppImage, Debian, RPM | `dist/linux/` | `electron-builder` |
| **Windows** | `x64` (64-bit) | NSIS Setup (`.exe`), Portable (`.zip`) | `dist/windows/` | `electron-builder` |
| **macOS** | `Universal` (x64 + arm64) | Apple Disk Image (`.dmg`), Archive (`.zip`) | `dist/mac/` | `electron-builder` |

---

## 2. Linux Packaging Details (`pnpm dist:linux`)

- **AppImage**: Standalone portable runtime. Includes bundled Electron runtime, unpacked Chromium resources, and `app.asar`.
  - Self-contained, runs on Ubuntu 20.04+, Pop!_OS, Debian 11+, Fedora 34+, Arch Linux.
  - Generates differential update metadata (`latest-linux.yml`).
- **Debian / RPM**: Installs to `/opt/Zenkai/`, registers `.desktop` launcher in system menu, and installs high-resolution application icons in `/usr/share/icons/hicolor/`.

---

## 3. Windows Packaging Details (`pnpm dist:win`)

- **NSIS Setup (`.exe`)**:
  - Interactive setup wizard allowing standard installation to `%LOCALAPPDATA%\Programs\Zenkai`.
  - Creates Desktop and Start Menu shortcuts.
  - Registers uninstaller in Windows Settings & Control Panel.
  - Generates `.blockmap` file and `latest.yml` for delta auto-updates.
- **Portable ZIP**: Zero-install standalone archive. Unpacks and runs `Zenkai.exe` directly.

---

## 4. Native Modules & Dependency Packing

The application bundles `onnxruntime-node` for local neural network inference in Vision Studio.
- In `electron-builder.yml`, `asarUnpack` is configured to extract native binaries (`*.node`, `*.so`, `*.dll`, `*.dylib`) outside `app.asar` into `app.asar.unpacked/node_modules/onnxruntime-node/bin/`.
- This ensures the OS dynamic linker can load native C++ symbols without filesystem extraction failures.

---

## 5. Artifact Verification & Checksum Manifest

Every release build executes `scripts/verify-artifacts.mjs`:
1. Validates that binary files exist and are non-empty.
2. Checks ELF binary headers on Linux AppImages.
3. Checks PE32+ portable executable headers on Windows installers.
4. Generates an authoritative `dist/SHA256SUMS.txt` cryptographic manifest.

