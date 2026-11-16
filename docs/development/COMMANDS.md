# Zenkai Desktop — Commands Reference

This is the canonical reference for all commands defined in `package.json` and utility scripts in `scripts/`. Do not invent alternative commands.

---

## 1. Development & Build Commands

| Command | Action | Description |
|---|---|---|
| `pnpm dev` | `electron-vite dev` | Starts Vite dev server with hot module replacement (HMR) and live Electron reloads. |
| `pnpm build` | `electron-vite build` | Compiles main process (`out/main`), preload (`out/preload`), and renderer (`out/renderer`). |
| `pnpm typecheck` | `tsc --noEmit` | Executes strict TypeScript compiler checks across the entire codebase. |
| `pnpm lint` | `eslint .` | Runs ESLint flat config with zero tolerated warnings or errors. |

---

## 2. Test & Quality Assurance Commands

| Command | Action | Description |
|---|---|---|
| `pnpm test` | `vitest run` | Runs full Vitest unit test suite (37 files, 236 tests). |
| `pnpm e2e` | `playwright test` | Runs Playwright Electron end-to-end test suite (20 workflows). |
| `pnpm qa:doctor` | `node scripts/qa-doctor.mjs` | Diagnostic health check of system binaries, toolchains, registries, and hardware. |
| `pnpm qa:registry` | `node scripts/validate-qa-registry.mjs` | Validates 100% traceability across 38 features, 50 components, and 20 gates. |
| `pnpm qa:unit` | `vitest run tests/unit` | Targeted execution of all unit test suites under `tests/unit/`. |
| `pnpm qa:integration` | `vitest run stream-proxy updater hls` | Targeted integration tests for network streaming, HLS parsing, and updater. |
| `pnpm qa:electron` | `xvfb-run -a playwright test app.spec.ts qa-workflows.spec.ts` | Runs primary Electron application startup and workflow tests. |
| `pnpm qa:gpu` | `vitest run gpu.test.ts vision-hardware.test.ts vision-live.test.ts` | Tests multi-GPU routing, WebGPU switch matrices, and capability tiering. |
| `pnpm qa:security` | `vitest run shield.test.ts ssrf-maturity.test.ts ipc-validation.test.ts` | Security regression tests (SSRF guards, protocol filters, IPC schema checks). |
| `pnpm qa:performance` | `vitest run canary-health.test.ts` | Performance latency benchmarks and canary health checks. |
| `pnpm qa:regression` | `typecheck + lint + qa:unit + qa:electron` | Full automated local regression pipeline. |
| `pnpm qa:report` | `node scripts/generate-qa-report.mjs` | Generates formatted `qa/RELEASE_READINESS.md` report. |
| `pnpm qa:all` | `node scripts/qa-runner.mjs` | Executes complete 7-step local acceptance gate in 35 seconds. |

---

## 3. Packaging & Distribution Commands

| Command | Action | Description |
|---|---|---|
| `pnpm dist:linux` | `pnpm build && electron-builder --linux AppImage deb -p never` | Packages Linux x86_64 AppImage and Debian package. |
| `pnpm dist:win` | `pnpm build && electron-builder --win -p never` | Packages Windows x64 NSIS setup installer and portable zip. |
| `pnpm dist:mac` | `pnpm build && electron-builder --mac -p never` | Packages macOS Universal DMG and zip (runs on macOS hosts). |
| `pnpm release:check` | `node scripts/verify-zero-mock.mjs` | Quality gate verifying zero mock data or placeholder loops. |
| `pnpm release:verify` | `node scripts/verify-artifacts.mjs` | Verifies cryptographic checksums and binary headers in `dist/`. |
| `pnpm release:version` | `node scripts/release-version.mjs` | Computes next SemVer tag from conventional git commits. |

