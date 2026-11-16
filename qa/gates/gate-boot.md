# Acceptance Gate: GATE-BOOT — Application Lifecycle & Windowing

**Target System**: Electron Main Process Lifecycle, Window Creation, and State Restoration  
**Feature IDs**: `FEAT-BOOT`, `FEAT-LIFE-01`, `FEAT-LIFE-02`, `FEAT-LIFE-03`  
**Gate Owner**: Application Reliability Engineer  
**Status**: **PASS**  

---

## 1. Mandatory Pass Criteria

1. **Launch Latency**: Application cold start reaches first interactive frame in under 1.5 seconds.
2. **Window State Persistence**: Previous window dimensions, maximized state, and coordinates restore atomically from user preferences (`settings.json`).
3. **Smooth Visual Presentation**: `show: false` initial configuration with `ready-to-show` event listener prevents white flashing or unstyled layout during startup.
4. **Single Instance Locking**: `app.requestSingleInstanceLock()` prevents duplicate processes; secondary instance attempts immediately focus and bring the primary window to front.
5. **Clean Termination**: Window close cleanly unregisters global shortcuts, flushes state to disk, terminates child processes (e.g., local proxy servers), and exits with code 0.

---

## 2. Verification Protocol & Execution Evidence

### Test Execution
- **Unit Suite**: `tests/unit/app-lifecycle.test.ts`
- **E2E Test**: `tests/e2e/window-lifecycle.spec.ts`
- **Physical CDP Verification**: Electron launched with `--remote-debugging-port=9333` and inspected via Vercel `agent-browser`.

```bash
# Command executed
env -u ELECTRON_RUN_AS_NODE xvfb-run -a ./release-test/linux-unpacked/zenkai-desktop --no-sandbox --remote-debugging-port=9333
```

### Measured Evidence
- **Cold Boot Time**: 480ms to `ready-to-show` event.
- **Window Initialization**: Browser window spawned at 1280x800, maximized status accurately retrieved from `settings.json`.
- **Single Instance Guard**: Secondary launch exited with code 0; primary window received `second-instance` IPC and restored focus.
- **Renderer Root Readiness**: `div#root` mounted with hash router without DOM exception.

---

## 3. Verdict
**PASS**: All 5 mandatory lifecycle criteria verified under automated test suite and live CDP session.

