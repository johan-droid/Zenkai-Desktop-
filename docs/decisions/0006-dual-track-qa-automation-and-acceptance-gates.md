# ADR-0006: Dual-Track QA Automation, Registries & Release Gates

- **Status**: ACCEPTED
- **Date**: 2026-11-16
- **Commit**: `1b28a65`
- **Deciders**: QA & Release Reliability Team

---

## Context

Previous QA rounds identified a recurring risk: exploratory test findings were documented in static Markdown reports, but lacked an automated system to enforce criteria across daily commits. As new features and fixes were added, manual verification alone could not prevent regressions across all 38 application features and 50 interactive UI controls.

## Decision

We designed and implemented a **Permanent Dual-Track QA Automation and Release Gate Architecture**:

1. **Machine-Readable Registries**:
   - `qa/registry/features.json`: Full catalog of 38 features with IDs, source files, automated tests, and acceptance gates.
   - `qa/registry/components.json`: Full catalog of 50 interactive UI controls with selectors, interactions, and expected state mutations.
   - `qa/registry/gates.json`: Index of 20 release acceptance gates with severities and evidence paths.
2. **Traceability & Coverage Validator**:
   - `scripts/validate-qa-registry.mjs`: Validates 100% disk existence of all referenced tests, gates, and screenshots.
3. **Automated Screen & Dead-Control Detectors**:
   - `tests/e2e/fixtures/screen-detector.ts`: Detects blank/black screens, unhandled React error boundaries, missing critical DOM elements, and inactive controls. Automatically captures failure screenshots to `qa/artifacts/failures/`.
4. **Permanent E2E Workflows**:
   - `tests/e2e/qa-workflows.spec.ts`: 10 comprehensive Playwright workflows exercising all 20 gates.
5. **Dual-Track Release Formula**:
   - $$\text{Release Readiness} = \text{LOCAL\_QA\_PASS} \land \text{CI\_PASS} \land \text{NO\_OPEN\_CRITICAL\_DEFECTS}$$
   - Local track: `pnpm qa:all` executes Doctor $\to$ Registry $\to$ Typecheck $\to$ Lint $\to$ Unit $\to$ Electron E2E $\to$ Report in 35s.
   - CI track: `.github/workflows/qa-pr.yml`, `qa-main.yml`, `qa-nightly.yml`, `qa-release.yml`.

## Alternatives Considered

- **Ad-hoc exploratory QA**: Rejected because it cannot provide repeatable regression prevention or continuous integration enforcement.

## Consequences

### Positive
- Zero guesswork regarding feature coverage or test existence.
- Automatic failure screen capture on UI regressions.
- Strict release gate enforcement before any production binary can be distributed.

### Negative / Trade-offs
- Running full local E2E requires headless Xvfb environment on Linux.
- New features or UI components require registering in `features.json` and `components.json` before passing validation.

