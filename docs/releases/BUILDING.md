# Zenkai Desktop — Building & Packaging Guide

**Document Version:** 1.0.0  
**Target Release:** Zenkai Desktop v0.0.1  
**Author:** Zenkai Engineering Release Team  
**Status:** Canonical Reference

---

## 1. System Requirements & Prerequisites

### 1.1 Development & Build Host
- **Operating System:** Linux (Ubuntu 22.04+, Pop!_OS 22.04+, Debian 12+, Fedora 38+) or Windows 10/11 x64.
- **Node.js:** `>= 20.18.0` (LTS recommended)
- **Package Manager:** `pnpm` `>= 9.0.0`
- **Native Tools:**
  - Standard C/C++ runtime libraries (`glibc`, `libstdc++`)
  - FUSE (required for mounting and testing AppImages on Linux)

---

## 2. Setting Up the Repository

```bash
# Clone the repository
git clone https://github.com/johan-droid/Zenkai-Desktop-.git
cd Zenkai-Desktop-

# Install dependencies deterministically
pnpm install --frozen-lockfile
```

---

## 3. Verification & Testing

Before generating release packages, execute the verification suite:

```bash
# 1. Typecheck the entire TypeScript codebase
pnpm typecheck

# 2. Run the Vitest unit and integration test suite (29 suites, 168 tests)
pnpm test

# 3. Run the Playwright E2E integration suite
pnpm e2e
```

---

## 4. Compiling the Application

The build process uses `electron-vite` to bundle the main process, preload bridge, and renderer SPA:

```bash
# Clean compilation of main, preload, and renderer bundles
pnpm build
```

This compiles:
- `out/main/index.js` (Target: Node.js / Electron Main)
- `out/preload/index.js` (Target: Context Isolation Preload Bridge)
- `out/renderer/` (Static bundle: HTML5, CSS3 with Tailwind v4, JS chunks)

---

## 5. Packaging Distributables

### 5.1 Linux AppImage Packaging
To produce the portable Linux AppImage:

```bash
npx electron-builder --linux AppImage -p never
```
- **Generated Artifact:** `release/Zenkai-Desktop-0.0.1-x86_64.AppImage` (or `dist/linux/Zenkai-Desktop-0.0.1-x86_64.AppImage`)
- **Verification:**
  ```bash
  chmod +x dist/linux/Zenkai-Desktop-0.0.1-x86_64.AppImage
  ./dist/linux/Zenkai-Desktop-0.0.1-x86_64.AppImage --help
  ```

### 5.2 Windows NSIS Installer Packaging
To produce the Windows NSIS Setup installer (`.exe`):

```bash
npx electron-builder --win nsis -p never
```
- **Generated Artifact:** `release/Zenkai-Desktop-Setup-0.0.1-x64.exe` (or `dist/windows/Zenkai-Desktop-Setup-0.0.1-x64.exe`)
- **Features:** Self-contained installer with user-selectable directory, Desktop and Start Menu shortcut creation, and automatic uninstaller registration.

---

## 6. Checksum Generation

All release distributables must be cryptographically hashed using SHA-256:

```bash
cd dist
sha256sum linux/* windows/* > SHA256SUMS.txt
cat SHA256SUMS.txt
```

