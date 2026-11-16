# Zenkai Desktop — Environment & Platform Verification Matrix

This matrix details the runtime platforms, GPU architectures, graphics APIs, and packaging configurations evaluated during the Zenkai Desktop QA and verification mission.

---

## 1. Platform & Hardware Evaluation Matrix

| Category | Target / Specification | Evaluation Mode | Test Coverage / Status | Notes & Evidence |
|---|---|---|---|---|
| **Primary OS** | Linux (Pop!_OS 24.04 LTS, Kernel 6.9.3) | **Physical Hardware** | **VERIFIED & ACCEPTED** | Primary test bench. Full end-to-end execution. |
| **Secondary OS**| Windows 11 (23H2 / 24H2) | Static / Architecture / Unit | **VERIFIED (Structural)** | D3D11/D3D12 switch synthesis & Media Foundation tests pass. |
| **Tertiary OS** | macOS (macOS 14 Sonoma / 15 Sequoia) | Static / Architecture / Unit | **VERIFIED (Structural)** | Metal backend & VideoToolbox decoder switch synthesis pass. |
| **GPU 1 (Target)**| **AMD Radeon Graphics (Lucienne / Renoir)**<br>PCI ID: `1002:164c` | **Physical Hardware** | **VERIFIED & ACCEPTED** | Mesa RADV RENOIR Vulkan 1.3, `radeonsi` VA-API H.264/HEVC/VP9. |
| **GPU 2** | NVIDIA GeForce / RTX Series (Ampere, Ada, Blackwell) | Unit / Switch Synthesis | **VERIFIED (Unit)** | `--enable-gpu-rasterization`, D3D11/Vulkan switches verified. |
| **GPU 3** | Intel Arc / UHD Graphics / Iris Xe | Unit / Switch Synthesis | **VERIFIED (Unit)** | VA-API/QuickSync and D3D11 decoding switches verified. |
| **GPU 4** | Apple Silicon M-Series (M1, M2, M3, M4) | Unit / Switch Synthesis | **VERIFIED (Unit)** | Metal pipeline & VideoToolbox switches verified. |
| **Display Server 1** | COSMIC Wayland (Native Desktop Session) | Physical System Inspection | **VERIFIED** | App runs natively on COSMIC Wayland session. |
| **Display Server 2** | Headless Xvfb (`Xvfb :99 -screen 0 1280x800x24`) | Automated CI / CDP Daemon | **VERIFIED & ACCEPTED** | Daemon running with `--ozone-platform=x11` on CDP port 9333. |
| **Packaging 1** | Linux AppImage (`Zenkai-Desktop-0.0.1-x86_64.AppImage`) | Artifact Extraction & ASAR Audit | **VERIFIED** | Package extracted, ASAR decompiled, hashes verified. |
| **Packaging 2** | Linux Unpacked Binary (`release-test/linux-unpacked/`) | Live Execution & CDP Automation | **VERIFIED & ACCEPTED** | Binary physically operated via Vercel `agent-browser`. |
| **Installed Prod**| Installed AppImage (`/home/.../Applications/Zenkai/`) | Read-Only Protected | **UNTOUCHED** | Strictly preserved per project safety requirements. |

---

## 2. Graphics & Video Decoder Subsystems

```text
+-----------------------------------------------------------------------------------+
|                           ZENKAI DESKTOP GPU RUNTIME                              |
+-----------------------------------------------------------------------------------+
                                    |
      +-----------------------------+-----------------------------+
      |                             |                             |
[Linux (amdgpu)]           [Windows (DirectX)]           [macOS (Metal)]
  - Driver: radeonsi         - Backend: D3D11/D3D12        - Backend: Metal
  - Vulkan: Mesa RADV        - Decoder: Media Foundation   - Decoder: VideoToolbox
  - VA-API: Hardware         - Angle: D3D11                - Switches: Verified Unit
  - Verified: PHYSICAL       - Verified: Unit / Schema     - Verified: Unit / Schema
      |                             |                             |
      +-----------------------------+-----------------------------+
                                    |
                    [Universal GPU Coordinator]
                    - configureGpuSwitches()
                    - gpuPreference: Auto | High Perf | Power Save
                    - Fallback: Graceful Software Rendering
```

---

## 3. Physical AMD Test Bench Detailed Specifications

- **Processor**: AMD Ryzen 5 5500U with Radeon Graphics (6 cores, 12 threads)
- **Integrated Graphics**: AMD Lucienne / Renoir (`1002:164c`, Rev c1)
- **Kernel DRM Driver**: `amdgpu` (Mesa 24.0.9-0ubuntu0.1)
- **Vulkan ICD**: `/usr/share/vulkan/icd.d/radeon_icd.x86_64.json` (RADV)
- **VA-API Library**: `/usr/lib/x86_64-linux-gnu/dri/radeonsi_drv_video.so`
- **VA-API Capabilities Verified**:
  - `VAProfileH264ConstrainedBaseline`: VAEntrypointVLD
  - `VAProfileH264Main`: VAEntrypointVLD
  - `VAProfileH264High`: VAEntrypointVLD
  - `VAProfileHEVCMain`: VAEntrypointVLD
  - `VAProfileHEVCMain10`: VAEntrypointVLD
  - `VAProfileVP9Profile0`: VAEntrypointVLD
  - `VAProfileVP9Profile2`: VAEntrypointVLD

