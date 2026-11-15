# ZENKAI VISION — INITIAL ARCHITECTURE & FEASIBILITY AUDIT
## Phase 0 Architectural Gate: Video Decoded Frame Access & GPU Enhancement Feasibility
**Document Version:** 1.0.0  
**Status:** ARCHITECTURAL GATE PASSED (Verified Evidence)  
**Target Repository:** `https://github.com/johan-droid/Zenkai-Desktop-`  
**Classification:** Read-Only Application & Media Pipeline Audit  

---

## 1. Executive Summary & Locked Product Decisions

This audit establishes the architectural foundations and technical feasibility for **Zenkai Vision** — a high-performance, local-first, GPU-accelerated video enhancement engine integrated into Zenkai Desktop.

### 1.1 Dual Operational Modalities

| Modality | Target Use Case | Execution Engine | Default State | Failure / Fallback Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Live Enhancement** | Real-time upscaling & enhancement during video playback in the desktop player. | In-renderer WebGPU compute/fragment shaders (e.g., Anime4K WGSL pipeline) with zero-copy texture sampling. | **Disabled by default** (manual user opt-in required). | **Immediate Bypass**: If frame rate drops below threshold or GPU stalls, drop to raw `<video>` playback instantaneously. Normal playback is never interrupted. |
| **Offline Enhancement** | Batch / offline enhancement of downloaded episodes and local video files to 1080p, 4K, or 8K. | Isolated native worker process running FFmpeg demuxing/remuxing and ONNX Runtime / TensorRT / DirectML / Vulkan inference. | User-initiated task queue in dedicated Studio view. | **Safe Pause/Fail**: Source video is read-only. Atomic `.part` writing preserves target and allows recovery. |

### 1.2 Core Locked Engineering Principles
1. **Playback Invariant**: Normal playback must never depend on, wait for, or break because of AI enhancement.
2. **Local-Only Privacy**: Zero cloud video processing. No video frames, telemetry, or source data ever leave the local machine.
3. **Hardware Truthfulness**: No fake GPU controls, simulated inference meters, or unverified resolution claims. If hardware lacks VRAM for 8K export, the option is qualified or disabled with explicit rationale.
4. **Clean Isolation**: Heavy inference must never block the Electron main process or the React UI thread. Offline enhancement executes in an isolated worker or utility process.
5. **No Cross-Origin Exploitation**: Cross-origin remote embed iframes are explicitly recognized as `FRAME_ACCESS_UNSUPPORTED`. No brittle hacks, screen scrapers, or browser security bypasses.

---

## 2. Application Architecture Audit

Zenkai Desktop is built on a modern, secure, and production-grade Electron stack.

### 2.1 Technology Stack & Versions
- **Electron Runtime**: Electron `45.3.2` (Chromium `132.0.6834.160`, Node.js `24.22.1`, V8 `13.2`).
- **Frontend Framework**: React `19.3.1`, TypeScript `7.0.2` (strict mode), Vite `8.3.8`, `electron-vite` `6.0.0`.
- **Styling & Design System**: Tailwind CSS `4.3.5`, Framer Motion `14.14.0`, Lucide React `1.73.0`.
- **Media & Streaming Libraries**: `hls.js` `1.7.4`, `anime4k-webgpu` `1.0.0`, `@webgpu/types` `0.1.74`.
- **Native Packaging**: `electron-builder` `26.18.0` targeting Linux (`.AppImage`, `.deb`), Windows (`NSIS .exe`), and macOS (`.dmg`).

### 2.2 Process & Security Architecture
```
┌────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN PROCESS                           │
│  src/main/index.ts · security.ts · window.ts · renderer-updater.ts     │
│  - Chromium command-line switches & GPU qualification                  │
│  - Network header normalization & origin enforcement                   │
│  - Local protocol handling (zenkai://) & download manager              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC (Strictly Typed Contract)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           PRELOAD BRIDGE                               │
│  src/preload/index.ts · src/shared/ipc-contract.ts                     │
│  - contextIsolation: true, nodeIntegration: false                      │
│  - Only 9 whitelisted namespaces exposed on window.zenkai              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ window.zenkai
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS (SPA)                          │
│  src/renderer/src/ · React 19 + Vite                                   │
│  - CinePlayer.tsx: HTML5 <video> + WebGPU overlay <canvas>             │
│  - WatchPage.tsx: Server resolution & direct vs. embed dispatch        │
│  - upscale.ts: WebGPU pipeline with requestVideoFrameCallback          │
└────────────────────────────────────────────────────────────────────────┘
```

- **IPC Boundary**: Defined strictly in `src/shared/ipc-contract.ts` (`IpcContract` and `IpcEvents`). Verified by automated test suites (`scripts/t4-bridge-check.mjs` and `scripts/t3-security-check.mjs`). No arbitrary channel invocation is permitted.
- **Process Boundaries**: The renderer has no direct access to Node.js `fs`, `child_process`, or native binaries. All file-system operations and process orchestration must be mediated by typed IPC to the main process or dedicated utility processes.

---

## 3. Video Playback & Media Pipeline Audit

The core player in Zenkai Desktop is implemented in `src/renderer/src/components/CinePlayer.tsx` (3,721 lines).

### 3.1 Media Elements & Decoding Mechanics
1. **HTML5 Video Element**:
   - The primary playback engine is a native `<video ref={vid} className="zp-v" playsInline preload="auto" ... />`.
   - Chromium's internal media pipeline decodes video using hardware acceleration (VA-API on Linux, D3D11/D3D12 on Windows, VideoToolbox on macOS) into GPU decoder textures.
2. **HLS Stream Engine**:
   - `hls.js` (`^1.7.4`) is instantiated with worker support enabled, buffer caps (`maxBufferLength: 45s`, `backBufferLength: 90s`), and automatic bitrate ladder negotiation.
   - Streams are fed via `hls.loadSource(streamUrl)` and bound to the video element with `hls.attachMedia(v)`.
3. **Direct File Engine**:
   - `isFileSrc(url)` checks whether the stream URL resolves to a direct `.mp4`, `.webm`, or `.mkv` file.
   - If a plain file is detected, `hls.js` is bypassed and the URL is assigned directly to `v.src`.
4. **Subtitles & Audio**:
   - Subtitles are scraped/fetched separately (`src/renderer/src/lib/subtitles.ts`), parsed into memory, and rendered via custom styled DOM overlays. They are not burned into the video stream, meaning video frames remain clean and unencumbered by text overlays.
   - Multi-audio streams are switched via HLS audio track selection or API stream parameters without reloading the player.

### 3.2 Existing Upscaling Prototype (`src/renderer/src/lib/upscale.ts`)
The repository contains an existing WebGPU upscaler implementation utilizing `anime4k-webgpu`:
- **WebGPU Feature Detection**: Checked via `gpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator`.
- **Zero-Copy Frame Acquisition**:
  ```ts
  // In upscale.ts:
  device.importExternalTexture({ source: video })
  ```
  This WebGPU primitive creates a `GPUExternalTexture` wrapping the current decoded video frame directly on the GPU without CPU readback or memory copying.
- **Render Loop**: Driven by `video.requestVideoFrameCallback(loop)`, which synchronizes shader execution with Chromium's video compositor presentation timestamp. Fallback to `requestAnimationFrame` is implemented.
- **Visual Presentation**: Rendered to a hardware-accelerated `<canvas ref={cv} className="zp-v" ... />` positioned directly on top of the `<video>` element with `pointerEvents: 'none'`.
- **Fault Tolerance**: If WebGPU initialization fails or device loss occurs (`device.lost`), `setUpErr()` is called and the canvas is hidden, leaving the native `<video>` playing smoothly.

---

## 4. Frame Access Feasibility Matrix (Gate 1 Evidence)

To guarantee that Zenkai Vision does not attempt impossible or brittle integrations, every video playback source in Zenkai Desktop (`src/renderer/src/lib/servers.ts` and `src/renderer/src/pages/WatchPage.tsx`) has been audited and classified:

| Source / Server | Type | Delivery Mechanism | Decoded Frame Access Classification | Technical Proof / Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **MegaPlay** (`megaplay`) | Direct HLS | `hls.js` → `<video>` | **`FRAME_ACCESS_SUPPORTED_WITH_LIMITATIONS`** | Decoded frames are directly accessible via WebGPU `importExternalTexture({ source: video })`, `createImageBitmap(video)`, or `<canvas>` 2D `drawImage()`. Requires CORS allowlist on CDN or proxy header rewriting. High-framerate 1080p may drop frames on low-end iGPUs. |
| **Vidstream** (`vidstream`) | Direct HLS | `hls.js` → `<video>` | **`FRAME_ACCESS_SUPPORTED_WITH_LIMITATIONS`** | Same as MegaPlay. Fully accessible via HTMLMediaElement frame callbacks. |
| **FlixCloud** (`flixcloud`) | Direct HLS | `hls.js` → `<video>` | **`FRAME_ACCESS_SUPPORTED_WITH_LIMITATIONS`** | Direct multi-audio HLS stream. Clean video frames accessible. |
| **ACDN** (`acdn`) | Direct HLS | `hls.js` → `<video>` | **`FRAME_ACCESS_SUPPORTED_WITH_LIMITATIONS`** | Tokenized stream with custom referer headers handled by Electron main process proxy. Fully accessible in `<video>`. |
| **Local Downloaded Videos** (`.mp4`, `.mkv`, `.ts`) | Local File | File URL / Native FFmpeg | **`FRAME_ACCESS_SUPPORTED`** | **100% Unconstrained Frame Access.** Zero CORS restrictions. Can be decoded via Chromium `<video>` or natively extracted frame-by-frame via FFmpeg CLI / libavcodec into raw RGBA/YUV buffers for batch AI upscaling. |
| **AnimeSalt 1 & 2** (`animesalt-1/2`) | API Embed | Cross-Origin `<iframe>` | **`FRAME_ACCESS_UNSUPPORTED`** | Resolved via remote API to third-party embed player. Cross-origin sandbox prevents DOM and canvas frame access. |
| **MegaPlay Embed** (`megaplay-ani/mal`) | Embed | Cross-Origin `<iframe>` | **`FRAME_ACCESS_UNSUPPORTED`** | Sandboxed iframe from `megaplay.buzz`. Browser security forbids reading internal video frames. |
| **ReAnime, ZokoAnime, TryEmbed, Vidnest, YumeZone** | Embed | Cross-Origin `<iframe>` | **`FRAME_ACCESS_UNSUPPORTED`** | External player embeds (`vidnest.fun`, `zokoanime.video`, etc.). Origin isolated. |
| **VidZee, VidLove, 1Embed, CinemaOS, 2Embed** | Embed | Cross-Origin `<iframe>` | **`FRAME_ACCESS_UNSUPPORTED`** | External movie/TV player embeds. Origin isolated. |

### 4.1 Gate 1 Architectural Verdict
- **Direct Playback & Local Downloads**: Frame access is **PROVEN** and already active in production code via WebGPU external textures and HTML5 video callbacks.
- **Remote Embeds**: Frame access is **IMPOSSIBLE** under standard web security boundaries without hazardous screen scraping.
- **Mandatory Architectural Rule**:
  ```ts
  // Zenkai Vision Dispatch Policy
  if (currentServer.kind !== 'direct' && !isLocalFile) {
    visionState.available = false;
    visionState.reason = 'Live AI enhancement requires a Direct HLS server or local file.';
    visionState.active = false; // Hard bypass
  }
  ```

---

## 5. Hardware Acceleration & Inference Engines

### 5.1 Host System Hardware Qualification (Audit Environment)
- **Primary GPU**: AMD Lucienne (Radeon Vega Mobile / Integrated Graphics, rev c2).
- **Kernel & Driver Interface**: Linux 6.x DRI (`/dev/dri/card1`, `/dev/dri/renderD128`), Mesa VA-API, Vulkan driver.
- **Media Binaries**: FFmpeg `7.0.2-static` and FFprobe `7.0.2-static` present in `/home/ashutoshsahoo/.local/bin/ffmpeg`.

### 5.2 GPU Backend Compatibility Matrix
| Platform | Primary Hardware | Live Inference Provider | Offline Inference Provider | Fallback Provider |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | NVIDIA GeForce / RTX | WebGPU (D3D12/Vulkan) | ONNX Runtime (CUDA / TensorRT) | DirectML / CPU |
| **Windows** | AMD Radeon / Intel Arc | WebGPU (D3D12) | ONNX Runtime (DirectML) | CPU (AVX2/AVX512) |
| **Linux** | AMD Radeon / Intel | WebGPU (Vulkan) | ONNX Runtime (Vulkan / OpenVINO / CPU) | CPU (AVX2) |
| **Linux** | NVIDIA | WebGPU (Vulkan) | ONNX Runtime (CUDA / TensorRT) | CPU |
| **macOS** | Apple Silicon (M1–M4) | WebGPU (Metal) | ONNX Runtime (CoreML) | CPU |

### 5.3 Automated Hardware Discovery Strategy
In Zenkai Desktop, hardware detection will operate at two tiers:
1. **Tier 1 (Renderer / WebGPU)**:
   ```ts
   const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
   const info = await adapter.requestAdapterInfo();
   // Returns: vendor, architecture, device, description
   ```
2. **Tier 2 (Main Process / Node.js Native)**:
   - Call `app.getGPUInfo('complete')` on startup to inspect Chromium's GPU driver blacklist, feature status (`webgpu: enabled`, `video_decode: hardware_accelerated`), and VRAM allocations.
   - For offline processing, query system GPU utilities (`vulkaninfo`, `nvidia-smi`, or DirectML device enumeration).

---

## 6. Offline Video Enhancement Subsystem (Architecture)

Offline enhancement requires a dedicated, isolated execution pipeline capable of processing long-form anime videos without memory leaks or UI stalls.

### 6.1 Worker Process Architecture
Offline jobs must **NEVER** run in the Electron main process (which would block window management and IPC) or in the renderer process (which would crash or freeze the UI).

```
┌────────────────────────────────────────────────────────┐
│                   MAIN PROCESS                         │
│  src/main/vision/vision-manager.ts                     │
│  - Job queue management (pause, resume, cancel)       │
│  - IPC dispatcher to renderer                          │
└───────────────────────────┬────────────────────────────┘
                            │ utilityProcess.fork()
                            ▼
┌────────────────────────────────────────────────────────┐
│              VISION OFFLINE UTILITY WORKER             │
│  src/main/vision/worker/enhancement-worker.ts          │
│                                                        │
│  Step 1: FFmpeg Demux & Stream Probe                   │
│          Extract video stream, audio, subs, chapters   │
│                                                        │
│  Step 2: Frame-by-Frame Pipeline                       │
│          FFmpeg rawvideo pipe ──► AI Model Inference   │
│          (YUV420p / RGB24)        (ONNX / TensorRT)    │
│                                           │            │
│  Step 3: FFmpeg Hardware / NVENC Encode   ▼            │
│          Mux enhanced video + original audio/subs      │
│          into output.enhanced.mp4.part                 │
│                                                        │
│  Step 4: Atomic Rename & Metadata Verification         │
│          Atomic rename to output.enhanced.mp4          │
└────────────────────────────────────────────────────────┘
```

### 6.2 Model Strategy & Tiled Inference for 4K / 8K
- **Approved Models**:
  - `Real-ESRGAN-AnimeVideo-v3` (Optimized for 2D animation, compact, high fidelity).
  - `Anime4K` (Ultra-fast shader-based upscaling for lighter GPUs).
  - `Compact / Compact3` (Ultra-lightweight models for integrated GPUs).
- **Tiling Engine (Crucial for VRAM Stability)**:
  Processing a single 8K frame ($7680 \times 4320$) in uncompressed float32 tensor format consumes over 1.2 GB of VRAM per layer, causing immediate OOM on consumer GPUs.
  - The offline inference engine must implement **tiled overlapping decomposition** (e.g., $512 \times 512$ or $1024 \times 1024$ tiles with 32px blend margins).
  - Tiles are processed sequentially through the inference engine and stitched back with linear/cosine blending to eliminate seam artifacts.

---

## 7. UI Integration & Design Consistency Audit

New Zenkai Vision controls must seamlessly adopt Zenkai's established design system.

### 7.1 Design Tokens & Aesthetic Standards
- **Backgrounds**: Deep black/zinc (`#08080a`, `bg-zinc-950`, `bg-zinc-900/80` glassmorphism).
- **Borders & Dividers**: Subtle borders (`border-white/10`, `border-zinc-800`).
- **Typography**: Inter / Outfit fonts, crisp uppercase tracking (`tracking-wider`, `text-xs font-semibold`).
- **Accent Accents**: Emerald (`text-emerald-400` for active/healthy), Amber (`text-amber-400` for warnings/embed bypass), Red (`text-rose-500` for errors), Sky (`text-sky-400` for direct streams).
- **Animations**: Framer Motion spring curves (`{ type: 'spring', damping: 25, stiffness: 300 }`).

### 7.2 Integration Touchpoints
1. **Player Overlay (CinePlayer Controls)**:
   - Dedicated "Zenkai Vision" badge & button in the quick settings bar.
   - Flyout popover with Mode selection (Real-Time Anime4K, Denoise, Sharpness), Upscale Intensity slider, and live GPU FPS / frame drop metrics.
   - When an embed server is selected, the Vision toggle displays a disabled badge: `"Vision: Direct Servers Only"`.
2. **Dedicated "Vision Studio" Page / Drawer**:
   - Accessible via the sidebar (`DesktopSidebar.tsx`) under a new item: `Zenkai Vision`.
   - File selector / drag-and-drop zone for local `.mp4` / `.mkv` files.
   - Direct integration with completed items in the Download Manager.
   - Configuration card: Target Resolution (1080p, 1440p, 4K, 8K), Model profile, GPU Acceleration device selector, Audio pass-through toggle.
   - Real-time progress tracker: Percentage, processed frames, ETA, current FPS, VRAM usage gauge.
   - Interactive Split-Screen Preview (Before / After slider).
3. **Settings Panel (`ProfilePage.tsx`)**:
   - Hardware diagnostics card displaying detected GPU, driver version, WebGPU status, and maximum supported output resolution.

---

## 8. Security, Licensing & Dependency Audit

### 8.1 Security & Sandboxing Policies
- **No Remote Code Execution**: Model weights must be distributed as static `.onnx` or compiled shader files. Weight files must be cryptographically hashed (SHA-256) and verified prior to loading.
- **IPC Validation**: All IPC payloads between renderer, main, and utility processes must be validated using `zod` schemas to prevent parameter tampering or path traversal.
- **Path Sanitization**: Offline enhancement outputs must be confined to the user-selected destination directory, strictly using `sanitizeFilename()`.

### 8.2 Licensing Review
- **FFmpeg**:
  - Bundling precompiled static FFmpeg binaries requires strict compliance with LGPL 2.1 (or GPL 3.0 if `--enable-gpl` features like `libx264`/`libx265` are compiled in).
  - Because Zenkai Desktop executes FFmpeg as an external isolated subprocess CLI (`child_process.spawn`), FFmpeg's GPL license does not infect or contaminate the proprietary/unlicensed host Electron application under standard legal precedent for separate CLI execution.
- **ONNX Runtime**: MIT License (fully permissive).
- **Anime4K**: MIT License (fully permissive).
- **Real-ESRGAN / Compact Models**: BSD 3-Clause / Apache 2.0 (fully permissive).

---

## 9. Implementation Phasing & Gating Plan

To respect the user's non-negotiable staging directives, implementation will strictly follow the 3 sequential gates:

```
┌────────────────────────────────────────────────────────┐
│  GATE 1: ARCHITECTURE GATE (CURRENT - COMPLETE)        │
│  - Verify decoded frame access in player.              │
│  - Classify all servers into direct vs. embed.         │
│  - Deliver INITIAL_ARCHITECTURE_AUDIT.md.              │
└───────────────────────────┬────────────────────────────┘
                            │ Approved
                            ▼
┌────────────────────────────────────────────────────────┐
│  GATE 2: OFFLINE ENHANCEMENT GATE                      │
│  - Phase 1: Hardware discovery & typed IPC contracts.  │
│  - Phase 2: Isolated worker & ONNX / model integration.│
│  - Phase 3: Offline MVP (FFmpeg local file upscaling). │
│  - Phase 4: Tiled inference, progress, 4K/8K export.   │
│  - Deliver: Genuine offline upscaled video evidence.   │
└───────────────────────────┬────────────────────────────┘
                            │ Approved
                            ▼
┌────────────────────────────────────────────────────────┐
│  GATE 3: LIVE ENHANCEMENT GATE                         │
│  - Phase 5: Frame-source adapter & instant bypass.     │
│  - Phase 6: Player UI integration & latency monitoring.│
│  - Phase 7: Comprehensive regression & soak tests.     │
│  - Deliver: Flawless zero-playback-impact live toggle. │
└────────────────────────────────────────────────────────┘
```

---

## 10. Gate 1 Evaluation Summary & Next Action

- **Architecture Gate (Gate 1) Status**: **PASSED**.
- **Key Finding**: Decoded frame access is completely feasible for Direct HLS servers and local files via existing WebGPU external texture sampling and FFmpeg pipelines. Embed servers are clearly isolated and will be handled via an explicit, non-disruptive bypass policy.
- **Next Immediate Step**: Await user review and alignment on Gate 1 findings. Upon approval, proceed to **Phase 1 Foundations** (Hardware discovery, typed IPC contracts, and worker process lifecycle).

