# Zenkai Desktop — Autonomous Agent & Contributor Playbook

Welcome, Agent. This playbook defines mandatory execution rules, architectural principles, test workflows, and constraints for maintaining **Zenkai Desktop**.

Read this document completely before modifying code, configuration, or documentation.

---

## 1. Prime Invariants & Safety Constraints

1. **Never Commit Mock Data**:
   - Production source code must connect to authentic endpoints or fall back to authentic bundled snapshots (`public/home-data.json`, `public/anime-mapping.json`).
   - Synthetic mock data is strictly forbidden outside `tests/unit/`.
   - The zero-mock gate (`pnpm release:check`) will fail any build with synthetic stubs.
2. **Never Falsify Hardware Verification**:
   - Only declare hardware as "Physically Verified" if real physical execution evidence exists on the specified physical GPU.
   - For other platforms (NVIDIA, Intel, Apple Silicon), truthfully label verification as "Structurally Tested" or "Unit Tested".
3. **Never Weaken Electron Security**:
   - Do NOT set `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, or `webSecurity: false`.
   - Never expose raw Node.js APIs (`fs`, `child_process`, `net`) to the renderer. All IPC must pass through the typed preload bridge in `src/preload/index.ts`.
4. **Never Break Video Playback for GPU Enhancement**:
   - Live AI upscaling (Zenkai Vision WebGPU) must be fail-safe. If WebGPU device acquisition or shader execution fails, video playback MUST continue using standard software decoding and canvas rendering.
5. **Never Commit Secrets or Distributable Binaries**:
   - Keep API keys, private tokens, signing certificates, and credentials out of Git.
   - Do not commit large binary packages (`.AppImage`, `.exe`, `.deb`, `.rpm`, `.zip`, `.asar`). Distributables belong in GitHub Releases.
6. **No Unauthorized Commits, Merges, or Releases**:
   - `main` is the **single canonical branch**. All work is committed and pushed directly to `main` (or via short-lived topic branches that are merged and deleted promptly).
   - Do not create long-lived feature branches. If a topic branch is needed for a large task, delete it immediately after merging to `main`.
   - Do not commit, push to `main`, create git tags, or trigger GitHub releases without explicit user approval.
   - Never overwrite the user's installed production AppImage (`/home/ashutoshsahoo/Applications/Zenkai/Zenkai-Desktop-1.0.0-x86_64.AppImage`).

---

## 2. Directory Layout & Architecture Map

| Directory | Role & Contents | Guidance |
|---|---|---|
| `src/main/` | Electron main process: lifecycle, window, tray, GPU switches, HLS proxy, downloads | Keep Node.js logic and system integrations here. |
| `src/preload/` | Context isolation bridge exposing `window.zenkai` (9 namespaces) | Strictly typed; do not leak raw `ipcRenderer`. |
| `src/renderer/` | Bundled React 19 web app: 36 pages, components, lib, shaders | Standard React/TypeScript; no Node.js imports. |
| `src/shared/` | Cross-process types, Zod schemas, IPC contracts | Single source of truth for types between main and renderer. |
| `server/` | Standalone streaming resolvers, SSRF defense, provider adapters | Used by local proxy; keep SSRF filter strict. |
| `services/update-control/` | Update control backend microservice (rollouts, webhooks) | Isolated workspace package. |
| `tests/unit/` | 37 Vitest test suites (236 tests) | Run via `pnpm test`. |
| `tests/e2e/` | Playwright Electron test suites & screen detectors | Run via `pnpm e2e` or `pnpm qa:electron`. |
| `qa/` | Registries, gates, reports, screenshots, and historical audits | Validate via `pnpm qa:registry`. |
| `docs/` | Modular documentation portal (architecture, development, gpu, etc.) | Canonical documentation directory. |
| `scripts/` | Developer tooling, QA doctor, release automation | Documented in `docs/development/COMMANDS.md`. |

---

## 3. Essential Commands

```bash
# Setup & Health Check
pnpm install --frozen-lockfile
pnpm qa:doctor               # Diagnoses Node, pnpm, Xvfb, VA-API, registries

# Code Quality & Typings
pnpm typecheck               # Strict TypeScript check (0 errors required)
pnpm lint                    # ESLint check (0 warnings required)

# Test Suites
pnpm test                    # Full Vitest unit test suite (37 files, 236 tests)
pnpm qa:registry             # Validates 100% QA registry traceability
pnpm e2e                     # Playwright Electron E2E suite (20 tests)
pnpm qa:all                  # One-shot local release gate (Doctor -> Build -> E2E)

# Packaging & Pre-Release Verification
pnpm build                   # Compiles main, preload, and renderer bundles
pnpm release:check           # Zero-mock production data integrity gate
pnpm dist:linux              # Builds Linux AppImage and DEB packages
```

---

## 4. Execution Workflow for New Features / Bug Fixes

When implementing changes:
1. **Investigate First**: Read existing code, relevant test files, and IPC contracts in `src/shared/` before changing behavior.
2. **Preserve Compatibility**: Keep backward-compatible IPC schemas. If an IPC channel changes, update `src/shared/ipc-contract.ts` and both sides of the bridge.
3. **Register New Workflows**:
   - If adding a feature module: Add entry to `qa/registry/features.json`.
   - If adding an interactive UI control: Add entry to `qa/registry/components.json`.
4. **Validate Locally**: Run `pnpm qa:registry && pnpm typecheck && pnpm test`.
5. **Run E2E Regression**: Run `pnpm qa:electron` using `screen-detector.ts` to ensure no black screens or dead controls were introduced.

---

## 5. Canonical Documentation Links

- [System Architecture Overview](docs/architecture/OVERVIEW.md)
- [Electron Process & IPC Security](docs/architecture/ELECTRON_ARCHITECTURE.md)
- [Universal GPU Architecture & Diagnostics](docs/gpu/README.md)
- [Production Release & CI/CD Process](docs/releases/RELEASE_PROCESS.md)
- [Testing Strategy & Screen Detectors](docs/development/TESTING.md)
- [QA Artifact & Evidence Index](qa/ARTIFACT_INDEX.md)

