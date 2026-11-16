# Zenkai Desktop — Production Repository Cleanup Inventory

**Document Version:** 1.0.0  
**Generated Date:** 2026-11-16  
**Auditor:** Senior Release & Reliability Engineer  
**Scope:** Complete repository inventory across source, configuration, assets, tests, tools, build outputs, and documentation.

---

## 1. Executive Summary

This inventory classifies every repository path, identifies its role within the production build lifecycle, and specifies its authoritative treatment according to the Non-Negotiable Safety Rules.

| Category | File/Path Count | Treatment Rule | Risk Level |
|---|---|---|---|
| **Production Source** | 240+ files | Preserve completely; maintain strict typings and IPC contracts | None |
| **Production Configuration** | 9 root/service files | Preserve; ensure lockfile and packaging integrity | None |
| **Build & Packaging Config** | 6 scripts + resources | Preserve; validates multi-platform target assembly | None |
| **Tests & Test Fixtures** | 45+ test files/fixtures | Preserve; enforce test matrix and regression suites | None |
| **Required Static Assets** | 80+ assets (`public/`, `resources/`) | Preserve; vital for desktop UI and offline mode | None |
| **Developer Tooling** | 10 utility scripts | Preserve in `scripts/`; streamline execution | Low |
| **Canonical Documentation** | 30+ markdown files | Organize into modular `docs/` hierarchy | Low |
| **Historical QA Evidence** | 20+ reports and audits | Archive under `qa/historical/` and index in `qa/` | Low |
| **Generated Build Outputs** | 4 directories (`out/`, `dist/`, etc.) | Retain in `.gitignore`; keep local test binaries | Low |
| **Temporary Logs & Caches** | `squashfs-root/`, `.ruff_cache/` | Purged safely; ignore rules added | Low |
| **Secrets & Private Data** | `.env`, `.pem`, credentials | Block via `.gitignore`; 0 leaks confirmed | High |
| **Unknown or Ambiguous Files** | Superseded v1 documents | Harmonize and redirect to v2 canonical locations | Low |

---

## 2. Exhaustive Itemized Inventory

### 2.1 Production Source Code

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `src/main/index.ts` | Main process entry point, lifecycle, window orchestration | Preserve | Core Electron bootstrap | None |
| `src/main/gpu.ts` | Multi-GPU detection, vendor switch injection, WebGPU | Preserve | Universal GPU acceleration | None |
| `src/main/renderer-updater.ts` | OTA Renderer updater with 5s canary rollback | Preserve | Track A over-the-air update engine | None |
| `src/main/updater.ts` | Native AppImage/NSIS desktop updater | Preserve | Track B native update engine | None |
| `src/main/protocol.ts` | Custom scheme (`zenkai://`, `atom://`) handlers | Preserve | Secure asset and deep link protocol | None |
| `src/main/tray.ts` | Native system tray menu and notification integration | Preserve | Desktop OS shell integration | None |
| `src/main/menu.ts` | Application menu bar configuration | Preserve | Desktop OS standard menu | None |
| `src/main/api/**` | Local API proxy, streaming route adapters | Preserve | Resilient streaming engine | None |
| `src/main/downloads/**` | HLS download pipeline, AES-128 in-memory decryption | Preserve | Offline media library engine | None |
| `src/main/ipc/**` | IPC endpoint handlers (GPU, settings, downloads, etc.) | Preserve | Process boundary communication | None |
| `src/main/vision/**` | Hardware detection, ONNX worker, ffmpeg pipeline | Preserve | Vision Studio offline upscaler | None |
| `src/preload/index.ts` | Context isolation bridge exposing 9 typed namespaces | Preserve | Security boundary bridge | None |
| `src/renderer/src/**` | React 19 application (pages, components, hooks, lib) | Preserve | Desktop renderer interface | None |
| `src/shared/**` | Shared schemas, IPC contracts, API types, vision types | Preserve | Cross-process type contracts | None |
| `server/**` | Streaming provider adapters, SSRF defense, resolvers | Preserve | Standalone API services | None |
| `services/update-control/src/**` | Update control microservice (rollout, webhooks) | Preserve | Backend update release control | None |

### 2.2 Production Configuration

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `package.json` | Project manifest, dependencies, npm scripts | Preserve | Central dependency & script registry | None |
| `pnpm-lock.yaml` | Root dependency lockfile | Preserve | Ensures reproducible deterministic builds | None |
| `pnpm-workspace.yaml` | Workspace config for root and update service | Preserve | Multi-package workspace definition | None |
| `electron-builder.yml` | Multi-platform packaging configuration | Preserve | Dictates AppImage, NSIS, DMG targets | None |
| `electron.vite.config.ts` | Electron Vite compilation configuration | Preserve | Multi-process bundler configuration | None |
| `tsconfig.json` | Root TypeScript strict configuration | Preserve | Static typing rules and path aliases | None |
| `eslint.config.mjs` | ESLint flat configuration | Preserve | Code quality and linting standards | None |
| `services/update-control/package.json` | Microservice manifest | Preserve | Update server dependencies | None |
| `services/update-control/pnpm-lock.yaml` | Microservice lockfile | Preserve | Microservice deterministic lockfile | None |
| `services/update-control/tsconfig.json` | Microservice TypeScript configuration | Preserve | Microservice typing configuration | None |

### 2.3 Build & Packaging Configuration

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `scripts/after-sign.mjs` | Post-packaging hook for code signing / notarization | Preserve | Platform packaging pipeline | None |
| `scripts/gen-icons.mjs` | Icon generation utility for `.ico` and `.icns` | Preserve | Required for multi-platform build | Low |
| `scripts/gen-tray-icon.mjs` | System tray icon generation script | Preserve | Required for tray asset build | Low |
| `scripts/release-version.mjs` | Automated SemVer calculation from conventional commits | Preserve | Release automation engine | None |
| `scripts/verify-artifacts.mjs` | Independent cryptographic and binary inspection script | Preserve | CI/CD artifact verification gate | None |
| `scripts/verify-zero-mock.mjs` | Zero-mock production data integrity validator | Preserve | Pre-packaging quality gate | None |
| `resources/**` | App icons (`icon.ico`, `icon.icns`, `icon.png`, `tray.png`) | Preserve | Mandatory packaging binaries | None |

### 2.4 Tests & Test Fixtures

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `vitest.config.ts` | Vitest test runner configuration | Preserve | Unit testing framework setup | None |
| `playwright.config.ts` | Playwright test runner configuration | Preserve | E2E testing framework setup | None |
| `tests/unit/*.test.ts` | 37 Vitest unit test suites (236 tests) | Preserve | Regression prevention across all units | None |
| `tests/e2e/*.spec.ts` | Playwright E2E suites (app, shell, workflows) | Preserve | Live Electron integration testing | None |
| `tests/e2e/fixtures/**` | Reusable fixtures (`tiny.mp4`, `screen-detector.ts`) | Preserve | Black-screen/dead-control detectors | None |
| `scripts/t*-check.mjs` | Milestone runtime contract verification scripts | Preserve | Diagnostic runtime verifiers | None |
| `services/update-control/tests/**` | Update control unit tests | Preserve | Update service backend verification | None |

### 2.5 Required Static Assets

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `public/**` | Web fonts, fallback catalog, SVG icons, rank badges | Preserve | Offline mode and static renderer UI | None |
| `src/renderer/public/**` | Renderer-scoped public assets | Preserve | Bundled into client renderer | None |

### 2.6 Developer Tooling & QA Automation

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `scripts/qa-doctor.mjs` | Environment diagnostic script (`pnpm qa:doctor`) | Preserve | Verifies system and build toolchain | Low |
| `scripts/validate-qa-registry.mjs` | Registry & traceability validator (`pnpm qa:registry`) | Preserve | Validates 100% test coverage | Low |
| `scripts/generate-qa-report.mjs` | Release report generator (`pnpm qa:report`) | Preserve | Formats `qa/RELEASE_READINESS.md` | Low |
| `scripts/qa-runner.mjs` | Multi-step QA pipeline orchestrator (`pnpm qa:all`) | Preserve | One-shot local release gate | Low |
| `scripts/capture-real-screenshots.mjs` | Live headless screenshot capturer | Preserve | Documentation screenshot automation | Low |
| `scripts/scrape-zenkai-home.mjs` | Fallback data refresher utility | Preserve | Updates offline catalog baseline | Low |

### 2.7 Canonical Documentation

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `README.md` | Primary project overview, features, quick start | Preserve / Update | Central repository portal | None |
| `CONTRIBUTING.md` | Development workflow, coding style, contribution | Preserve / Update | Contributor guidance | None |
| `SECURITY.md` | Security vulnerability reporting and posture | Created | Security transparency | None |
| `LICENSE` | UNLICENSED proprietary declaration | Created | Legal clarity matching package.json | None |
| `.gitattributes` | LF line endings and binary file declarations | Created | Cross-platform Git hygiene | None |
| `docs/README.md` | Documentation hub and sitemap | Organize | Navigation for all docs | Low |
| `docs/architecture/**` | Modular architecture specs (overview, IPC, data flow) | Organize | Engineering clarity | Low |
| `docs/development/**` | Developer guides (setup, commands, testing, debugging) | Organize | Onboarding and operational guides | Low |
| `docs/releases/**` | Release process, building, packaging specs | Organize | Production deployment reference | Low |
| `docs/gpu/README.md` | Universal GPU architecture & physical hardware audit | Consolidate | GPU engineering knowledge | Low |
| `docs/decisions/**` | Architecture Decision Records (ADRs 0001–0006) | Created | Historical design rationale | None |
| `AGENTS.md` | Autonomous agent execution guidelines | Created | Operational instructions for AI agents | None |

### 2.8 Historical QA Evidence

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `qa/registry/*.json` | Features, components, and gates registries | Preserve | Machine-readable source of truth | None |
| `qa/gates/*.md` | 20 dedicated acceptance gate criteria documents | Preserve | Release gate definitions | None |
| `qa/screenshots/*.png` | 19 live application component screenshots | Preserve | Visual verification proof | None |
| `qa/artifacts/failures/**` | Failure reproduction screenshots | Preserve | Defect audit evidence | None |
| `qa/historical/**` | Historical audit reports from initial passes | Curate | Durable historical records | None |
| `qa/ARTIFACT_INDEX.md` | Central index of all QA assets and evidence | Created | Navigation of QA history | None |

### 2.9 Generated Build Outputs

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `out/` | Compiled Electron main, preload, and renderer bundle | Retain locally | Build output (ignored in git) | Low |
| `dist/` | Packaged binaries (`linux/`, `windows/`) | Retain locally | Build output (ignored in git) | Low |
| `dist/SHA256SUMS.txt` | Cryptographic checksums of release binaries | Preserve | Tracked artifact verification manifest | Low |
| `release/` | Packaging staging directory (3.7 GB) | Retain locally | Ignored in git; stores test builds | Low |
| `release-test/` | Packaged test AppImage and unpacked tree (741 MB) | Retain locally | Ignored in git; validated by QA doctor | Low |

### 2.10 Temporary Logs & Stale Caches

| File Path | Description | Action | Reason | Risk |
|---|---|---|---|---|
| `squashfs-root/` | Empty AppImage extraction folder from audit | Removed | Stale temporary extraction artifact | Low |
| `.ruff_cache/` | Python linter cache from external tool | Removed | Stale temporary cache | Low |
| `.freebuff/` | Local workspace tool ID | Retain locally | Add to `.gitignore` to prevent tracking | Low |
| `test-results/` | Playwright test result cache | Retain locally | Ignored in `.gitignore` | Low |

### 2.11 Superseded or Duplicate Files

| File Path | Current Status | Proposed Action | Target Canonical Location |
|---|---|---|---|
| `docs/RELEASE_PROCESS.md` | Outdated v1.0.0 draft | Replace with redirect | `docs/releases/RELEASE_PROCESS.md` (v2.0.0) |
| `docs/release-notes-v0.0.1.md` | Draft release notes | Replace with redirect | `docs/releases/GITHUB_RELEASE_NOTES_v0.0.1.md` |
| `docs/update-infrastructure.md` | Overview memo | Replace with redirect | `docs/releases/UPDATE_ARCHITECTURE.md` |
| `docs/gpu-architecture.md` | Initial architecture notes | Consolidate | `docs/gpu/README.md` |

