# Zenkai Desktop — Local QA Execution & Verification Guide

This document describes how developers and QA engineers run, diagnose, and enforce the quality gates locally before pushing changes or proposing release candidates.

---

## 1. Quick Start

Ensure dependencies are installed and the application is compiled:

```bash
pnpm install
pnpm build
```

Run the all-in-one local release gate:

```bash
pnpm qa:all
```

A passing execution confirms that all 20 acceptance gates, static type constraints, linting rules, unit tests, and Playwright Electron E2E workflows are fully satisfied.

---

## 2. Command Reference

| Command | Purpose | Execution Scope | Mandatory for Release? |
|---|---|---|:---:|
| `pnpm qa:doctor` | Environment & dependency diagnostic probe | Node, pnpm, Xvfb, VA-API, Vulkan, build dirs | **YES** |
| `pnpm qa:registry` | Machine-readable traceability validation | `qa/registry/*.json` feature & component mappings | **YES** |
| `pnpm qa:unit` | Fast unit test suite | Vitest runner for `tests/unit/*.test.ts` | **YES** |
| `pnpm qa:integration` | Inter-process & service integration tests | Stream proxy, updater, HLS engine | **YES** |
| `pnpm qa:browser` | Web-rendered layout and shell tests | Home hero layout, header, navigation | **YES** |
| `pnpm qa:electron` | Real Electron runtime E2E tests | App launch, windowing, full user workflows | **YES** |
| `pnpm qa:desktop` | Native desktop integrations | Navigation routing, system notifications | **YES** |
| `pnpm qa:gpu` | Multi-vendor GPU architecture tests | Linux VA-API, Windows D3D11, Mac Metal | **YES** |
| `pnpm qa:security` | SSRF shield & token vault tests | Loopback SSRF, private IP blocking, token isolation | **YES** |
| `pnpm qa:performance` | Network latency & health probes | AniList GraphQL, GitHub API, Cloud CDN | Optional |
| `pnpm qa:visual` | Visual screenshot artifact checks | Confirms `qa/screenshots/` contains evidence PNGs | Optional |
| `pnpm qa:regression` | Full regression pass | Typecheck + Lint + Unit + Electron E2E | **YES** |
| `pnpm qa:report` | Generate Release Readiness markdown | Updates `qa/RELEASE_READINESS.md` | **YES** |
| `pnpm qa:all` | Comprehensive sequential gate runner | Runs Doctor -> Registry -> Type -> Lint -> Unit -> E2E -> Report | **YES** |

---

## 3. Step-by-Step Diagnostic & Execution Workflow

### Step 1: Run Environment Doctor
```bash
pnpm qa:doctor
```
- Verifies Node.js $\ge$ 20.x, pnpm, Git.
- Verifies Vercel `agent-browser` and Xvfb availability.
- Verifies compiled main process (`out/main/index.js`).
- Verifies VA-API and Vulkan drivers on Linux.

### Step 2: Validate Traceability Registries
```bash
pnpm qa:registry
```
- Validates all 38 features in `qa/registry/features.json`.
- Validates all 50 interactive components in `qa/registry/components.json`.
- Validates all 20 acceptance gates in `qa/registry/gates.json`.
- Fails with non-zero exit code if any test file or evidence link is missing.

### Step 3: Run Full Suite Locally
```bash
pnpm qa:all
```
- Executes all 7 verification steps in deterministic order.
- Generates updated status in `qa/RELEASE_READINESS.md`.

---

## 4. Failure Investigation & Self-Remediation

When a test fails during `qa:all`:

1. **Review Error Log**: Inspect the terminal output showing the specific failing assertion.
2. **Retrieve Failure Artifacts**: Check `qa/artifacts/failures/` for automatically captured screenshots:
   - `black-screen-fail-<timestamp>.png`
   - `dead-control-fail-<timestamp>.png`
3. **Reproduce Isolated Test**:
   ```bash
   # Run only the failing test file
   pnpm vitest run tests/unit/specific-test.test.ts
   # Or run single Playwright spec under Xvfb
   env -u ELECTRON_RUN_AS_NODE xvfb-run -a playwright test tests/e2e/qa-workflows.spec.ts
   ```
4. **Apply Minimal Fix**: Resolve root cause in `src/`.
5. **Add Regression Assertion**: Ensure the failure mode has a permanent test assertion.
6. **Re-run Gate**: Confirm `pnpm qa:all` exits with code 0.

