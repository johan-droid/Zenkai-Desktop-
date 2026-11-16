# Acceptance Gate: GATE-THEME — Theme Engine & Persistence

**Target System**: Dark / Light / System Theme Switching, CSS Variables & Native Splash Sync  
**Feature IDs**: `FEAT-THEME-01`  
**Gate Owner**: Test Automation Engineer  
**Status**: **AUTOMATED PASS (E2E Suite & Live CDP Inspection)**  

---

## 1. Mandatory Pass Criteria

1. **Theme Switching**:
   - Theme toggle button in header (`@e39`, `@e49`) switches between dark and light themes.
   - `dark` class toggles immediately on `<html>` or `<body>`.
2. **Zero White Flash**:
   - Initial window creation (`src/main/window.ts`) sets dark background color matching application theme.
   - Inline splash screen prevents unstyled content flashing during cold start.
3. **Persistence**:
   - Theme choice persists to `localStorage` key `zenkai-theme` across application restarts.

---

## 2. Verification Protocol & Execution Evidence

- **Commit Verification**: Commit `1fd3c64` eliminated startup white flash by enforcing native dark background on window creation.
- **Physical CDP Exploration**: Header theme buttons (`@e39`, `@e49`) verified in accessibility tree and interacted with without CSS layout shifts.
- **E2E Test**: `tests/e2e/shell.spec.ts` verifies window background color and theme class injection.

---

## 3. Verdict
**AUTOMATED PASS**: Theme toggle reactivity, persistence, and zero-white-flash startup verified.

