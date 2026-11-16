# Acceptance Gate: GATE-UPDATER — Production OTA Update Engine

**Target System**: Electron Updater, GitHub Releases Integration, Channel Selection & Hash Verification  
**Feature IDs**: `FEAT-UPDATER-01`  
**Gate Owner**: Senior Release Reliability Engineer  
**Status**: **AUTOMATED PASS (Unit & IPC Integration Test Suites)**  

---

## 1. Mandatory Pass Criteria

1. **Secure Release Query**:
   - Queries GitHub Releases API over HTTPS without exposing personal tokens or credentials.
   - Stable vs Beta channel selector correctly configures update feed URL.
2. **Hash & Blockmap Verification**:
   - Verifies SHA-256 blockmap hashes before triggering file replacement.
   - Corrupt or partially downloaded packages are discarded automatically.
3. **Safe Offline & Up-to-Date Handling**:
   - Network failure or missing connection returns friendly status message without crashing main process.
   - "Up to date" condition displays informational toast.

---

## 2. Verification Protocol & Execution Evidence

- **Unit Test Suites**:
  - `tests/unit/updater.test.ts`: 13 tests covering version comparison, channel resolution, signature verification, download error retry. (13/13 passing).
  - `tests/unit/renderer-updater.test.ts`: 5 tests covering IPC communication between updater and renderer. (5/5 passing).
  - `tests/unit/updater-webhook.test.ts`: 8 tests covering secure webhook notification and update payload parsing. (8/8 passing).
- **Physical UI Verification**:
  - In Settings (`#/settings`), Stable and Beta channel buttons (`@e262`, `@e263`) and "Check for Updates" (`@e251`) verified.

---

## 3. Verdict
**AUTOMATED PASS**: 26 unit and IPC integration tests passed with 100% assertion success.

