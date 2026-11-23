# Zenkai Desktop — Comprehensive Test Coverage Report

**Target Version:** `v1.0.6` (commit `08141c0` on `main`)  
**Test Harness:** Vitest 5.1.0 (Unit/Integration) & Playwright 1.65.1 (Electron E2E)  
**Total Automated Tests:** 248 Automated Tests across 48 Test Suites  
**Pass Rate:** **100% Passing** across all active unit, integration, and Electron E2E suites  

---

## 1. Test Architecture Overview

Zenkai Desktop employs a 5-layer testing pyramid designed to ensure software correctness, security boundaries, and hardware execution integrity without synthetic mocks in production code paths.

```
                  ┌──────────────────────────────┐
                  │  Layer 5: Native Platform    │ (AppImage, deb, NSIS setup, CI)
                  ├──────────────────────────────┤
                  │  Layer 4: Electron E2E Tests │ (36 Playwright specs under Xvfb)
                  ├──────────────────────────────┤
                  │  Layer 3: Integration Tests  │ (Stream proxy, HLS, IPC, Updater)
                  ├──────────────────────────────┤
                  │  Layer 2: Unit Test Suites   │ (36 Vitest files, 212 unit tests)
                  ├──────────────────────────────┤
                  │  Layer 1: Static Validation  │ (tsc, eslint, zero-mock, registries)
                  └──────────────────────────────┘
```

---

## 2. Test Execution Inventory by Layer

### Layer 1: Static Quality & Integrity Gates

| Gate Name | Tool / Script | Criteria | Result | Traceability |
|---|---|---|---|---|
| **TypeScript Typecheck** | `tsc --noEmit` | Strict mode, 0 errors | **0 Errors** | Source tree |
| **ESLint Static Analysis** | `eslint .` | 0 warnings, 0 errors | **0 Warnings** | Config rules |
| **QA Diagnostic Doctor** | `scripts/qa-doctor.mjs` | Node, pnpm, Xvfb, VA-API, Vulkan | **PASS** | Environment matrix |
| **QA Registry Traceability**| `scripts/validate-qa-registry.mjs`| 100% trace across 37 feats, 47 comps, 20 gates | **100% Traceable**| `qa/registry/*.json` |
| **Production Zero-Mock Gate**| `scripts/verify-zero-mock.mjs` | 0 mock files in 504 production sources | **504 Files Verified** | Zero-mock gate |

### Layer 2 & 3: Vitest Unit & Integration Suites (212 Tests)

| Suite Category | File Path | Tests | Coverage Scope | Status |
|---|---|---|---|---|
| **Security & SSRF** | `tests/unit/ssrf-maturity.test.ts` | 20 | CIDR filtering, IPv6, loopback, private networks | **PASS** |
| **IPC Security** | `tests/unit/ipc-validation.test.ts` | 3 | Zod schema validation on IPC channels | **PASS** |
| **Security Shield** | `tests/unit/shield.test.ts` | 6 | Token vault, auth barrier, header injection | **PASS** |
| **OTA Updater Engine** | `tests/unit/updater.test.ts` | 15 | Asset matching, version comparison, download state | **PASS** |
| **Updater Webhooks** | `tests/unit/updater-webhook.test.ts` | 8 | Rollout webhook integration and signing | **PASS** |
| **Stream Proxy** | `tests/unit/stream-proxy.test.ts` | 6 | Live segment resolution and proxy routing | **PASS** |
| **HLS Downloader** | `tests/unit/hls.test.ts` | 6 | Subtitle parsing, segment muxing, stream integrity | **PASS** |
| **Downloads Page & RPC** | `tests/unit/downloads-page-and-rpc.test.ts` | 9 | Download queues, pause, resume, cancel, delete | **PASS** |
| **GPU Architecture** | `tests/unit/gpu.test.ts` | 6 | Linux VA-API switches, Windows D3D, power flags | **PASS** |
| **Vision & WebGPU** | `tests/unit/vision-hardware.test.ts` | 8 | Hardware detection, probe telemetry, GPU status | **PASS** |
| **WebGPU Upscaler** | `tests/unit/webgpu-upscale.test.ts` | 5 | Preset switching, error boundaries, canvas resize | **PASS** |
| **Settings & State** | `tests/unit/settings.test.ts` | 8 | Atomic persistence, bounds, active playback guard | **PASS** |
| **Settings IPC** | `tests/unit/settings-ipc.test.ts` | 4 | Typed IPC handlers for client preferences | **PASS** |
| **API Client** | `tests/unit/api.test.ts` | 3 | Typed queries to AniList mapping and streams | **PASS** |
| **Playback State** | `tests/unit/playback-state.test.ts` | 2 | Auto-pause transitions on minimize / blur | **PASS** |
| **Playback Correctness** | `tests/unit/playback-correctness.test.ts`| 4 | Stream server failover, resolution selection | **PASS** |
| **Subtitles Engine** | `tests/unit/subtitles-engine.test.ts` | 6 | SRT / VTT parser, timestamp sync, styling | **PASS** |
| **Ascension RPG** | `tests/unit/ascension-progression.test.ts`| 10 | Daily quests, rank titles, streak milestones | **PASS** |
| **Desktop Navigation** | `tests/unit/desktop-navigation.test.ts` | 6 | Section hub, route transitions, sidebar state | **PASS** |
| **System Notifications**| `tests/unit/notify.test.ts` | 4 | OS notification triggers, window focus on click | **PASS** |
| **Other Core Suites** | (16 additional unit files) | 79 | Sanitize, servers, protocol, movie providers, etc.| **PASS** |
| **Total Vitest Tests** | **36 Test Files** | **212** | **100% Pass Rate** | **PASS** |

### Layer 4 & 5: Playwright Electron End-to-End Suites (36 Tests)

| Suite File | Test Count | Key Scenarios Verified | Status |
|---|---|---|---|
| `tests/e2e/app.spec.ts` | 2 | Electron startup, preload bridge, settings IPC, live stream resolution | **PASS** |
| `tests/e2e/qa-workflows.spec.ts` | 10 | WORKFLOW 01-10: Boot, Nav, Search, Anime, Settings, Downloads, Ascension, Manga/Novel, GPU, Schedule | **PASS** |
| `tests/e2e/home-layout.spec.ts` | 1 | Hero pager visibility, shelf layout positioning | **PASS** |
| `tests/e2e/shell.spec.ts` | 5 | Window bridge, auto-pause on hide, PiP toggle, downloads, deep link `zenkai://auth` | **PASS** |
| `tests/e2e/decoder-benchmark.spec.ts` | 2 | VA-API hardware decoding across 720p, 1080p, 1440p, 4K; FFmpeg software fallback | **PASS** |
| `tests/e2e/webgpu-hardware.spec.ts` | 2 | Physical WebGPU adapter acquisition, WGSL compilation, Anime4K preset execution, decommissioned Studio check | **PASS** |
| `tests/e2e/webgpu-benchmark.spec.ts` | 1 | Real-time preset benchmarks across resolutions on AMD Lucienne | **PASS** |
| `tests/e2e/sustained-playback.spec.ts` | 1 | 10-second sustained video playback with live WebGPU upscaling (31 FPS, 0 dropped frames) | **PASS** |
| `tests/e2e/device-loss-recovery.spec.ts`| 1 | Simulated WebGPU device loss and uninterrupted video playback fallback | **PASS** |
| `tests/e2e/integrated-renderer.spec.ts` | 2 | Bundled React 19 app render, downloads dashboard UI | **PASS** |
| `tests/e2e/ota-updater-lifecycle.spec.ts`| 5 | Update discovery, platform asset matching, checksum mismatch abort, in-place AppImage swap, settings persistence | **PASS** |
| `tests/e2e/windows-ota-lifecycle.spec.ts`| 4 | Windows `latest.yml` parsing, NSIS setup asset isolation, SHA-256/SHA-512 streaming validation, settings survival | **PASS** |
| **Total Playwright Tests** | **12 Test Files** | **36** | **100% Pass Rate** | **PASS** |

---

## 3. Critical Path Coverage Analysis

1. **OTA Update Pipeline:**
   - Covered: Discovery against live GitHub Releases API, channel selection (stable vs beta), platform asset isolation (Linux AppImage vs Windows NSIS), SHA-256 and Base64 SHA-512 cryptographic verification, `.part` download handling, in-place atomic rename, `.bak` backup preservation, rollback on corruption, settings persistence across updates.
2. **IPC Security Boundaries:**
   - Covered: Preload isolation without raw Node.js leakage, Zod schema validation for all inputs (`settings:set`, `downloads:start`, `app:openFile`), context bridge API isolation.
3. **Media & GPU Pipeline:**
   - Covered: VA-API hardware decoding (`VaapiVideoDecoder`) vs software fallback (`FFmpegVideoDecoder`), WebGPU device acquisition, WGSL shader pipeline, Anime4K external texture import, sustained playback frame rates (31 FPS), device loss recovery.
4. **User Preferences & Persistence:**
   - Covered: Window bounds persistence, download directory configuration, hardware decode toggles, auto-pause on window blur/minimize, Discord RPC toggles.

---

## 4. Uncovered Paths & Documented Limitations

1. **Windows Physical Execution:**
   - The test host is Pop!_OS 24.04 Linux.
   - Windows NSIS installer execution, manifest parsing, Base64 SHA-512 hashing, and settings persistence are fully tested via automated integration and CI (`windows-latest`).
   - Local physical execution on Windows hardware remains unverified due to host OS constraints.
2. **Multi-Monitor Dynamic DPI Migration:**
   - Single-monitor DPI scaling and window geometry persistence are verified.
   - Dynamic window dragging across mixed-DPI monitors on Wayland is not covered by headless Xvfb automation.
