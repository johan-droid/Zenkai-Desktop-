# ADR-0004: Vendor-Aware GPU Switches & Linux VA-API Decoding

- **Status**: ACCEPTED
- **Date**: 2026-11-16
- **Commit**: `1b28a65`
- **Deciders**: Linux Performance & GPU Engineering Team

---

## Context

Video streaming and live AI upscaling (Zenkai Vision via Anime4K WebGPU shaders) impose intense CPU and GPU workloads. Initial builds encountered three major issues on Linux:
1. WebGPU initialization failed silently in Chromium due to strict feature blacklists, causing the Vision HUD to report mock or stale hardware strings while falling back to software or failing.
2. Hardware video decoding was disabled by default in Chromium on Linux, forcing software H.264/HEVC decoding and causing high CPU utilization during 1080p playback.
3. Multi-GPU setups (integrated AMD/Intel APUs paired with discrete NVIDIA/AMD GPUs) had no mechanism for the user to select high-performance versus power-saving adapters.

## Decision

We implemented a **Universal, Vendor-Aware GPU Architecture** (`src/main/gpu.ts` and `src/renderer/src/lib/vision-live.ts`):

1. **Explicit Chromium Switch Injection**:
   - `enable-unsafe-webgpu`, `enable-webgpu-developer-features`, `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`.
   - On Linux with hardware decoding enabled: `enable-features=WebGPU,VaapiVideoDecoder,VaapiVideoEncoder`.
   - On Linux with hardware decoding disabled: `disable-accelerated-video-decode`.
2. **Power Preference Routing**:
   - Injects `force_high_performance_gpu` or `force_low_power_gpu` based on persistent user settings (`settings.gpuPowerPreference`).
3. **Truthful Adapter Reporting**:
   - The Vision HUD queries the active `GPUAdapter` directly via `navigator.gpu.requestAdapter()` and reports the exact device info returned by the driver (e.g. `Mesa RADV RENOIR (Lucienne)`).
   - If WebGPU adapter acquisition or shader compilation fails, the system immediately fails safe to ordinary video playback without disrupting the user, and truthfully flags `hardwareDecoding: false` / `visionActive: false`.
4. **Physical Hardware Validation Boundary**:
   - Physical hardware verification is formally established on AMD Radeon Lucienne / Renoir (Linux Pop!_OS 24.04).
   - NVIDIA, Intel, and Apple Silicon paths are verified through structural integration tests and unit suites pending physical device test runs.

## Alternatives Considered

- **Global Chromium Defaults**: Rejected because Chromium disables VA-API and WebGPU by default on modern Linux distros due to conservative blocklists.
- **Simulated Metrics / Mock Adapters**: Strictly prohibited. The system must report true driver capabilities or gracefully declare fallback.

## Consequences

### Positive
- Live WebGPU Anime4K enhancement validated and running on AMD Vulkan/RADV.
- Linux hardware video decoding functional via Mesa VA-API driver (`radeonsi`).
- User-controllable GPU power preferences exposed via Desktop Settings.

### Negative / Trade-offs
- Linux VA-API behavior depends on system-level Mesa and `libva` driver installation.
- Some legacy GPU drivers may require manual software decode fallback if driver crashes occur.

