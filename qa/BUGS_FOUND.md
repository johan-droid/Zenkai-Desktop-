# Zenkai Desktop — Defects & Findings Ledger

This document tracks all defects, compilation anomalies, runtime issues, and edge cases identified during the QA, browser automation, and verification passes.

---

## 1. Defect Summary & Severity Distribution

| Defect ID | Summary | Severity | Component | Status | Verified By |
|---|---|---|---|---|---|
| **BUG-001** | TypeScript type conversion error in `GPUFeatureStatus` | High | `src/main/gpu.ts` | **RESOLVED** | `pnpm typecheck` |
| **BUG-002** | Vulkan/Wayland conflict under headless Xvfb | Medium | Launch Configuration | **RESOLVED** | CDP Daemon run |
| **BUG-003** | Modal backdrop click intercept in Manga Reader | Low | `MangaReader.tsx` | **RESOLVED (By Design)**| `agent-browser` |
| **BUG-004** | Upstream novel provider timeout error handling | Low | `NovelReader.tsx` | **VERIFIED (Graceful)** | `agent-browser` |
| **BUG-005** | Ephemeral subshell killing background Electron daemon | Medium | QA Test Harness | **RESOLVED** | Background Task `task-7061` |

---

## 2. Detailed Defect Analysis

### BUG-001: TypeScript Type Conversion in Universal GPU Module
- **Discovered During**: Phase 0 Static Analysis & Universal GPU extension.
- **Error Log**:
  ```text
  src/main/gpu.ts:155:18 - error TS2352: Conversion of type 'GPUFeatureStatus' to type 'Record<string, string>' may be a mistake because neither type sufficiently overlaps with the other.
  ```
- **Root Cause**: Electron's `app.getGPUFeatureStatus()` returns a typed `GPUFeatureStatus` object where values are string literals (`'enabled'`, `'disabled'`, `'unavailable_software'`), lacking an index signature for dynamic string mapping.
- **Resolution**: Applied two-step cast `(app.getGPUFeatureStatus() as unknown as Record<string, string>)`.
- **Verification**: `pnpm typecheck` passed with 0 errors across main, preload, and renderer packages.

---

### BUG-002: Wayland Ozone Platform Warning in Headless Xvfb
- **Discovered During**: Initial headless Electron launch under Xvfb.
- **Error Log**:
  ```text
  [wayland_surface_factory.cc(249)] '--ozone-platform=wayland' is not compatible with Vulkan. Consider switching to '--ozone-platform=x11'.
  ```
- **Root Cause**: System default desktop environment is COSMIC Wayland, causing Electron's auto-hinting to attempt Wayland surface creation inside Xvfb, which only provides an X11 display.
- **Resolution**: Explicitly configured `--ozone-platform=x11` when running in headless Xvfb test environments, while leaving `--ozone-platform-hint=auto` for user desktop execution.
- **Verification**: Electron launched cleanly under Xvfb with Vulkan hardware acceleration initialized.

---

### BUG-003: Modal Backdrop Click Intercept in Manga Reader
- **Discovered During**: Physical browser automation in Manga Reader view.
- **Observation**:
  `agent-browser click @e901` ("Back to manga") failed because the Reading Settings drawer backdrop overlay intercepted mouse events.
- **Root Cause**: Expected modal focus trap behavior; the backdrop intentionally prevents background navigation while settings drawer is open.
- **Resolution**: Dismissed drawer via close button (`@e915`) or backdrop click prior to clicking background navigation elements.
- **Verification**: Smooth transition back to manga details page.

---

### BUG-004: Upstream Novel Provider API Timeout
- **Discovered During**: Physical inspection of Light Novel reader (`#/novel/novelfire/solo-leveling/read/chapter-1`).
- **Observation**:
  NovelFire chapter endpoint timed out from sandbox IP.
- **System Behavior**: Application caught network failure, avoided blank screen or crash, and rendered friendly error screen with "Try again" button and 3 alternate provider links ("NovelFull", "WebNovel", "Lnori").
- **Resolution**: Confirmed graceful error recovery is production-grade. Captured screenshot `qa/screenshots/15-novel-error-recovery.png`.

---

### BUG-005: Background Electron Daemon Lifetime
- **Discovered During**: Initial CDP agent-browser connection attempts.
- **Observation**: Spawning Electron with standard bash background operator (`&`) caused the process to receive SIGHUP upon command subshell exit.
- **Resolution**: Spawned the Electron process as a persistent background daemon task with `IsDaemon: true` on dedicated remote debugging port 9333.
- **Verification**: Background task `task-7061` remained active and responsive across all subsequent automation turns.

