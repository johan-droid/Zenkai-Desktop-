# Zenkai Desktop — Comprehensive QA Test Strategy

This document formalizes the multi-layered testing pyramid, verification policies, automated release gates, and regression protocols for Zenkai Desktop.

---

## 1. Multi-Layer Testing Architecture

```text
       ▲
      / \     Layer 5: Physical Hardware Verification (Local AMD Linux)
     /   \    - WebGPU Vulkan RADV adapter execution
    /     \   - VA-API hardware decoding entrypoint audit
   /───────\
  /         \   Layer 4: Real Electron E2E & Automation (Playwright / CDP)
 /           \  - Black-Screen & Dead-Control Detector
/             \ - Full user journeys (Startup, Navigation, Search, Player, Reader)
/───────────────\
/                 \   Layer 3: Subsystem Integration & Service Tests (Vitest)
/                   \  - Stream Proxy, HLS Muxer, OTA Updater, Settings Schema
/                     \ - Discord RPC, Notification Bridge, Window Controls
/───────────────────────\
/                         \   Layer 2: Component & Unit Logic Tests (Vitest)
/                           \  - WGSL shader math, path sanitization, Zod parsing
/                             \ - Anime4K pipeline degradation & recovery
/───────────────────────────────\
/                                 \   Layer 1: Static Analysis & Machine Registries
/                                   \  - TypeScript strict typecheck (0 errors)
/                                     \ - ESLint code standards (0 warnings)
/                                       \- Registry traceability validator (validate-qa-registry.mjs)
─────────────────────────────────────────
```

---

## 2. Test Execution & Threshold Rules

| Layer | Execution Trigger | Automated Tool | Threshold / Criterion | Blocking? |
|---|---|---|---|:---:|
| **Layer 1: Static** | Pre-commit / CI / `pnpm qa:all` | `tsc --noEmit`, `eslint .`, `validate-qa-registry.mjs` | 0 errors, 0 warnings, 100% registry mapping | **YES** |
| **Layer 2: Unit** | On change / CI / `pnpm qa:unit` | Vitest (37 suites, 236 tests) | 100% passing | **YES** |
| **Layer 3: Integration** | Pull request / `pnpm qa:integration` | Vitest integration runners | 100% passing | **YES** |
| **Layer 4: Electron E2E** | PR / Local Gate / `pnpm qa:electron` | Playwright `_electron` + Xvfb (20 tests) | 100% passing, 0 dead controls, 0 blank screens | **YES** |
| **Layer 5: Hardware** | Host QA / `pnpm qa:gpu` | Physical AMD GPU inspection | Verified physical hardware adapter | **YES (Linux)** |

---

## 3. Black-Screen & Dead-Control Detection Protocol

Implemented in [`tests/e2e/fixtures/screen-detector.ts`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Desktop/tests/e2e/fixtures/screen-detector.ts):

1. **`assertHealthyScreen`**:
   - Confirms `div#root` is mounted with active DOM children.
   - Verifies absence of unhandled React 19 Error Boundary crash text.
   - Verifies page contains interactive visual controls (distinguishes legitimate dark theme from blank rendering).
   - Automatically saves timestamped screenshot on detection failure to `qa/artifacts/failures/`.

2. **`assertActiveControl`**:
   - Asserts control is visible and enabled.
   - Interacts via accessible locator.
   - Polls for expected observable UI or state change within 5000ms.
   - Automatically saves failure screenshot and throws informative error if control is unresponsive ("dead control").

---

## 4. Release Criteria Formula

A build is accepted for release if and only if:

$$\text{Release Readiness} = \text{LOCAL\_QA\_PASS} \land \text{CI\_PASS} \land \text{NO\_OPEN\_CRITICAL\_DEFECTS}$$

- **`LOCAL_QA_PASS`**: All 20 acceptance gates in [`qa/ACCEPTANCE_GATES.md`](file:///home/ashutoshsahoo/Downloads/Zenkai%20Desktop/qa/ACCEPTANCE_GATES.md) verified via `pnpm qa:all`.
- **`CI_PASS`**: GitHub Actions workflows pass across target runner matrix.
- **`NO_OPEN_CRITICAL_DEFECTS`**: Zero blocker or high-severity defects recorded in `qa/BUGS_FOUND.md`.
