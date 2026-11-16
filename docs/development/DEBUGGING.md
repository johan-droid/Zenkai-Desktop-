# Zenkai Desktop — Debugging Guide

**Document Version:** 1.0.0  
**Scope:** Debugging main process, renderer DevTools, GPU diagnostics, and media streaming.

---

## 1. Running with Detailed Logging

To launch the desktop application with all internal diagnostic logs enabled:

```bash
# In development
pnpm dev

# Against compiled production binary with Chromium logging
./release-test/linux-unpacked/zenkai-desktop --enable-logging --v=1
```

Log outputs will include structured prefixes:
- `[MAIN    ]`: Electron application lifecycle, window state, and GPU switch initialization.
- `[API     ]`: Remote API request timing, mapping status, and HLS proxy resolution.
- `[DOWNLOAD]`: Download queue events, segment decryption times, and disk writing.
- `[VISION  ]`: WebGPU adapter negotiation, shader compilation, and frame compute timings.

---

## 2. Inspecting GPU Acceleration & Video Decoding

### In-App GPU Diagnostics
Navigate to **Desktop Settings** (`#/settings`) and inspect the **Universal GPU Architecture & Decoders** panel:
- **Active Adapter**: Displays GPU vendor, driver architecture, and WebGPU backend.
- **Hardware Decoding**: Reports whether `VaapiVideoDecoder`, `D3D11VideoDecoder`, or software `FFmpegVideoDecoder` is active.

### Chromium Internal Diagnostics
To inspect low-level Chromium GPU and media internal state:
1. Open DevTools in the main window (`Ctrl+Shift+I` or `F12`).
2. Alternatively, launch with `--remote-debugging-port=9222` and navigate to `chrome://gpu` or `chrome://media-internals` in an external browser.

---

## 3. Playwright E2E Test Debugging

To run E2E tests interactively with browser UI or step-by-step tracing:

```bash
# Run tests with UI inspector
pnpm exec playwright test --ui

# Run a single workflow in debug mode
pnpm exec playwright test tests/e2e/qa-workflows.spec.ts --debug
```

