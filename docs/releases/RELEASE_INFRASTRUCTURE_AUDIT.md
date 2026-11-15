# Zenkai Desktop — Release Infrastructure Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-16  
**Auditor:** Zenkai Release Engineering Team  
**Status:** Certified Read-Only Audit Findings  

---

## 1. Executive Summary

This audit establishes the baseline status of repository infrastructure, CI/CD pipelines, packaging toolchains, update engines, and security configurations in Zenkai Desktop prior to implementing the fully automated production release and cross-platform auto-update system.

The repository exhibits an established, functional core based on Electron Vite and Electron Builder, but relies on fragmented, semi-manual release triggering, missing cross-platform verification gates, and unverified binary downloads in the client updater.

---

## 2. Repository & Branch Strategy Audit

| Metric | Current State | Evaluation |
|---|---|---|
| **Remote Repository** | `https://github.com/johan-droid/Zenkai-Desktop-.git` | Confirmed active origin. |
| **Active Branch** | `main` | Production branch. All code changes land here. |
| **Commit Conventions** | Conventional Commits in active use (`feat:`, `fix:`, `docs:`, `chore:`, `style:`) | Well-structured commit history suitable for automated semantic release automation. |
| **Existing Tags** | `v0.0.1` (on HEAD `c1afb5c`), `v0.0.2` (on commit `98d06d3`) | **Anomaly Detected:** Tag ordering anomaly where `v0.0.1` was placed on a commit subsequent to `v0.0.2`. |
| **GitHub Releases** | `v0.0.2` (Latest, published, 0 assets), `v0.0.1` (Draft, contains only `SHA256SUMS.txt`) | **Finding:** No binary packages currently exist in GitHub Releases assets for installed clients to pull. |

---

## 3. Existing CI/CD Workflows

### 3.1 Continuous Integration (`.github/workflows/ci.yml`)
- **Triggers:** Push to `main`, Pull Requests targeting `main`.
- **Runner:** `ubuntu-22.04` (Linux only).
- **Execution Steps:**
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node 22)
  3. `pnpm/action-setup@v3` (pnpm 12)
  4. System dependencies: `rpm`, `libnotify-bin`, `libnotify-dev`
  5. `pnpm install --frozen-lockfile`
  6. `pnpm typecheck` (`tsc --noEmit`)
  7. `pnpm lint` (`eslint .`)
  8. `pnpm test` (`vitest run` — 30 test files, 174 tests passing)
  9. `pnpm build` (`electron-vite build`)
  10. `xvfb-run -a pnpm e2e` (`playwright test`)
- **Deficiencies Identified:**
  - ❌ **No Windows CI Job:** Windows compatibility is unverified on pull requests; bugs in Windows-specific paths (`\\.\pipe\`, registry, backslashes) pass CI undetected.
  - ❌ **No Zero-Mock-Data Gate:** Production bundles and source code are not scanned for forbidden mock datasets, stubbed APIs, or synthetic fixtures.
  - ❌ **No Security / Dependency Scan:** `pnpm audit` is omitted from the CI pipeline.
  - ❌ **No IPC Contract Automated Verification:** The preload bridge / IPC contract tests (`t4-bridge-check.mjs`, `t3-security-check.mjs`) are not part of standard CI.
  - ❌ **No Caching:** `node_modules` and pnpm store are re-downloaded on every run without safe cache keys.

### 3.2 Release Pipeline (`.github/workflows/release.yml`)
- **Triggers:** Push tags matching `v*`, or manual `workflow_dispatch`.
- **Jobs:**
  - `build-linux` (Ubuntu 22.04): Builds AppImage, deb, rpm.
  - `build-windows` (Windows Latest): Builds NSIS `.exe` and portable `.zip`.
  - `build-macos` (macOS 14): Builds DMG and zip (currently failing or unsigned).
  - `publish-release` (Ubuntu 22.04): Gathers artifacts, generates unified `SHA256SUMS.txt`, verifies non-empty files, and publishes via `softprops/action-gh-release@v2`.
- **Deficiencies Identified:**
  - ❌ **Manual Tagging Dependency:** Requires manual tag creation rather than calculating semantic versions from merged conventional commits on `main`.
  - ❌ **No Independent Artifact Verification:** Distributables are packaged and immediately uploaded without unpacking, validating ASAR contents, or smoke testing.
  - ❌ **No Concurrency Guard:** Competing runs can overwrite release assets or trigger race conditions.
  - ❌ **Over-broad Scope:** macOS packaging is attempted in the main pipeline despite missing credentials and unsigned limitations, threatening Linux/Windows release blocking.

---

## 4. Electron Packaging & Toolchain Audit

### 4.1 Framework & Version
- **Framework:** `electron-builder` `26.18.0`.
- **Configuration File:** `electron-builder.yml`.
- **Application ID:** `app.zenkai.desktop`.
- **Executable Names:**
  - Linux: `zenkai-desktop`
  - Windows: `Zenkai.exe`
- **ASAR Protection:**
  - `asar: true` enabled.
  - `afterSign: scripts/after-sign.mjs` configured.
  - Dynamic link library extraction: `onnxruntime-node` binaries extracted to `app.asar.unpacked/` allowing native C++ execution providers to load.

### 4.2 Linux Package Configuration
- **Target:** AppImage, deb, rpm (`x64`).
- **Target AppImage Name:** Configured in `electron-builder.yml` as `${productName}-Desktop-v${version}-Linux-x64.${ext}` (or target `Zenkai-Desktop-<version>-x86_64.AppImage`).
- **Desktop Entry:** `categories: AudioVideo`, `syncDesktopName: true`.
- **Tray & Icons:** Embedded 512x512 PNG, tray PNG, ICO.

### 4.3 Windows Installer Configuration
- **Target:** NSIS (`.exe`), Zip (`.zip`) (`x64`).
- **Target Setup Name:** `${productName}-Desktop-v${version}-Windows-${arch}-Setup.${ext}` (or target `Zenkai-Desktop-Setup-<version>-x64.exe`).
- **NSIS Options:** `oneClick: false`, `allowToChangeInstallationDirectory: true`, Start Menu and Desktop shortcuts enabled.
- **Signing Configuration:** `CSC_LINK` and `CSC_KEY_PASSWORD` secrets supported with SHA-256 authenticode hashing.

---

## 5. Application Versioning Audit

- **Authoritative Source:** `package.json` (`"version": "0.0.1"`).
- **Runtime Version Exposure:** `app.getVersion()` via IPC `app:version`.
- **Findings:**
  - `scripts/t4-bridge-check.mjs` contained hardcoded `"0.0.1"` check rather than reading `package.json`.
  - Git tag `v0.0.2` exists in git history and GitHub Releases, while `package.json` was kept at `0.0.1`.
  - Next version must be synchronized deterministically using an automated release script based on conventional commits.

---

## 6. Update Engine & In-App Client Audit

### 6.1 Architecture & Implementation
- **Core Update Engine:** `src/main/updater.ts`.
- **Libraries:** `electron-updater` `6.8.11`.
- **Channels Supported:** `stable` (default) and `beta`.
- **Channel Storage:** `userData/settings.json` (`channel: "stable" | "beta"`).
- **Direct GitHub Fallback:** `checkForUpdatesClient()` queries `https://api.github.com/repos/johan-droid/Zenkai-Desktop-/releases`.
- **In-App Prompt:** `src/renderer/src/components/UpdatePrompt.tsx` (spring animated toast) and `DesktopSettingsCard.tsx` (settings page update management).
- **Active Playback Protection:** `isPlaybackActive()` in `src/main/playback.ts` blocks intrusive prompts, background downloads, and application restarts during active video playback.

### 6.2 Update Security & Verification Gaps
1. **Missing Checksum Verification on Direct Download:**
   - In `startUpdateDownload()`, direct binary downloads stream to `downloads/<assetName>`. The downloaded file is neither hashed nor compared against `SHA256SUMS.txt` or `latest*.yml` before prompting to execute!
2. **Missing Update Lifecycle States:**
   - The IPC contract `updater:status` currently defines `idle | checking | available | not-available | downloading | downloaded | error`.
   - The required lifecycle (`CHECKING → AVAILABLE → USER_DECISION → DOWNLOADING → VERIFYING → READY_TO_INSTALL → INSTALLING → RESTARTING → UPDATED`) is missing explicit `verifying` state and checksum feedback.
3. **Missing Downgrade Guard:**
   - `checkForUpdatesClient()` only checks `newVer !== currentVersion`. If an older release is indexed, it could theoretically trigger an unintentional downgrade.
4. **Missing Local Diagnostic Bundle:**
   - No structured IPC endpoint or diagnostic log exists for users or developers to inspect last update check, downloaded file hash, or failure root cause without reading terminal logs.

---

## 7. Audit Conclusion & Implementation Action Plan

| Phase | Priority | Actions Required |
|---|---|---|
| **Phase 1: Versioning** | CRITICAL | Implement automated version calculation, tag generation, release notes generation, and lockfile synchronization based on conventional commits. |
| **Phase 2: CI Pipelines** | HIGH | Consolidate CI into dedicated multi-platform pipeline with Linux and Windows jobs, zero-mock gate, security scan, and cache optimization. |
| **Phase 3: Zero-Mock Gate** | CRITICAL | Implement zero-mock scanner script and fail-safe check in CI to guarantee no mock APIs or fixtures are bundled into production. |
| **Phase 4 & 5: Packaging & Verification** | HIGH | Standardize artifact names, build Linux AppImage & Windows NSIS Setup, and add independent verification job with artifact smoke tests. |
| **Phase 6: GitHub Publication** | HIGH | Coordinate end-to-end release automation with concurrency lock, draft release, asset verification, and automated publish. |
| **Phase 7 & 8: Update Engine & Security** | CRITICAL | Upgrade `updater.ts` with SHA-256 verification, `verifying` state, downgrade protection, and local diagnostics. |
| **Phase 9–12: Tests & Docs** | MEDIUM | Comprehensive unit tests for update validation, diagnostics, and complete documentation suite in `docs/releases/`. |
