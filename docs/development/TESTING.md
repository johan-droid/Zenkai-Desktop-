# Zenkai Desktop — Testing Strategy & Guidelines

**Document Version:** 1.0.0  
**Scope:** Test levels, fixtures, automated detectors, and regression requirements.

---

## 1. Multi-Tiered Testing Pyramid

Zenkai Desktop maintains strict test coverage at each layer:

```text
               ▲
              / \
             /   \      Playwright E2E Workflows (20 Tests)
            / E2E \     • Electron app startup, navigation, settings, player
           /───────\
          /         \   Targeted Integration Tests
         / Integrat. \  • HLS streaming proxy, IPC contract, OTA updates
        /─────────────\
       /               \ Vitest Unit Tests (37 Files, 236 Tests)
      /    Unit Tests   \• GPU switches, Zod schemas, SSRF filters, models
     /───────────────────\
```

---

## 2. Automated Regression & Screen Detectors

End-to-end tests leverage custom diagnostic fixtures in `tests/e2e/fixtures/screen-detector.ts`:

### 1. `assertHealthyScreen(page, screenName)`
- Evaluates the rendered DOM tree for:
  - Blank or zero-height document body.
  - Presence of unhandled React error boundary text (`Something went wrong`, `Fatal Error`).
  - Essential UI markers (header, navigation bar, hero container).
- If a screen failure is detected, an automatic full-page screenshot is captured to `qa/artifacts/failures/` with timestamp details.

### 2. `assertActiveControl(locator, controlId)`
- Verifies that target UI elements are:
  - Visible in the DOM (`toBeVisible()`).
  - Interactive and enabled (`toBeEnabled()`).
  - Capable of mutating DOM state or emitting observable IPC events upon click.
- Flags dead controls or unclickable UI elements.

---

## 3. Machine-Readable QA Registries

All test coverage is strictly cataloged in machine-readable JSON files:
- `qa/registry/features.json` (38 features mapped to unit & E2E tests).
- `qa/registry/components.json` (50 interactive controls with selectors and mutations).
- `qa/registry/gates.json` (20 release acceptance gates).

Run `pnpm qa:registry` to validate that every referenced test file and evidence screenshot exists on disk.

