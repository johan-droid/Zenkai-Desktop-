/// <reference types="@webgpu/types" />

export const gpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;

const WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: V;
  o.p = vec4f(pos[i], 0, 1);
  o.uv = vec2f((pos[i].x + 1) * 0.5, (1 - pos[i].y) * 0.5);
  return o;
}
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;
@fragment fn fs(v: V) -> @location(0) vec4f { return textureSample(t, s, v.uv); }
@group(0) @binding(1) var ext: texture_external;
@fragment fn fsExt(v: V) -> @location(0) vec4f { return textureSampleBaseClampToEdge(ext, s, v.uv); }
`;

export type VisionLivePreset =
  | 'modeA'
  | 'modeB'
  | 'modeC'
  | 'modeAA'
  | 'modeCA'
  | 'denoise'
  | 'fast';

export type GpuTier = 'dedicated_high' | 'balanced_igpu' | 'entry_igpu';

export interface VisionLiveMetrics {
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  currentFps: number;
  renderTimeMs: number;
  droppedFrames: number;
  adapterName: string;
  preset: VisionLivePreset;
  active: boolean;
  watchdogStatus: 'optimal' | 'warning' | 'degraded' | 'bypassed';
  gpuTier?: GpuTier;
}

export interface VisionLiveOptions {
  mode?: VisionLivePreset;
  powerPreference?: 'high-performance' | 'low-power' | 'auto';
  splitPercent?: number; // 0 to 100 (100 = full screen enhanced, 50 = split half-and-half)
  onMetrics?: (metrics: VisionLiveMetrics) => void;
  onBypass?: (reason: string) => void;
  onDegrade?: (suggestedPreset: VisionLivePreset) => void;
}

export interface VisionLiveHandle {
  stop: () => void;
  setSplitPercent: (percent: number) => void;
}

/**
 * Real-time GPU-accelerated video enhancement engine with fail-safe bypass.
 * Synchronizes with native video decoder via requestVideoFrameCallback.
 */
export async function startVisionLive(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  options: VisionLiveOptions = {},
): Promise<VisionLiveHandle> {
  const onBypass = options.onBypass;
  const onDegrade = options.onDegrade;
  const onMetrics = options.onMetrics;

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser environment');
  }

  // Await metadata to obtain native dimensions
  if (!video.videoWidth || video.readyState < 2) {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const onDone = () => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('loadedmetadata', onDone);
        video.removeEventListener('loadeddata', onDone);
        video.removeEventListener('canplay', onDone);
        video.removeEventListener('playing', onDone);
        resolve();
      };
      video.addEventListener('loadedmetadata', onDone);
      video.addEventListener('loadeddata', onDone);
      video.addEventListener('canplay', onDone);
      video.addEventListener('playing', onDone);
      setTimeout(onDone, 800);
    });
  }

  const inW = video.videoWidth || video.clientWidth || 1280;
  const inH = video.videoHeight || video.clientHeight || 720;

  if (inH >= 2160 && inW >= 3840) {
    throw new Error('Video source is already 4K native resolution; live enhancement bypassed.');
  }

  const powerPreference = options.powerPreference ?? 'high-performance';
  let adapter: GPUAdapter | null = null;
  if (powerPreference === 'low-power') {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' }).catch(() => null);
  } else {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  }
  if (!adapter) {
    adapter = await navigator.gpu.requestAdapter().catch(() => null);
  }
  if (!adapter) {
    throw new Error('No compatible GPU adapter found for WebGPU live processing');
  }

  // Reject CPU software fallback adapters (e.g. SwiftShader emulation)
  if ((adapter as any).isFallbackAdapter) {
    throw new Error('WebGPU physical hardware acceleration unavailable (fallback adapter rejected)');
  }

  let adapterName = 'GPU Adapter';
  let tier: GpuTier = 'balanced_igpu';
  let isIGPU = false;
  try {
    const info = (adapter as any).info || (await (adapter as any).requestAdapterInfo?.()) || {};
    const desc = (info.description || info.device || '').toLowerCase();
    const vendor = (info.vendor || '').toLowerCase();
    let arch = (info.architecture || '').toLowerCase();
    const deviceId = (info.device || '').toLowerCase();

    // Correct Dawn static PCI ID table misclassification (0x164c Lucienne / Renoir GFX9 mapped to rdna-2)
    const isAmdRenoirLucienne =
      vendor.includes('amd') &&
      (deviceId.includes('164c') ||
        desc.includes('renoir') ||
        desc.includes('lucienne') ||
        (arch.includes('rdna') && (desc.includes('graphics') || desc.includes('radv'))));

    if (isAmdRenoirLucienne) {
      arch = 'Vega / Renoir (GFX9)';
    }

    if (info.description) {
      adapterName = isAmdRenoirLucienne && !info.description.includes('Vega')
        ? `${info.description} (Vega / Renoir)`
        : info.description;
    } else if (info.device && !info.device.startsWith('0x')) {
      adapterName = info.device;
    } else if (info.vendor) {
      const vendorUpper = info.vendor.toUpperCase();
      adapterName = isAmdRenoirLucienne
        ? `${vendorUpper} Radeon Graphics (Vega / Renoir)`
        : `${vendorUpper}${arch ? ` (${arch})` : ''} GPU`;
    }

    // Classify GPU tiers: dedicated_high, balanced_igpu, entry_igpu
    if (vendor.includes('apple') || desc.includes('apple') || desc.includes('m1') || desc.includes('m2') || desc.includes('m3') || desc.includes('m4')) {
      if (desc.includes('max') || desc.includes('ultra') || arch.includes('max') || arch.includes('ultra')) {
        tier = 'dedicated_high';
      } else {
        tier = 'balanced_igpu';
      }
    } else if (vendor.includes('nvidia') || desc.includes('nvidia') || desc.includes('geforce') || desc.includes('rtx') || desc.includes('gtx')) {
      if (desc.includes('virtual') || desc.includes('llvmpipe')) {
        tier = 'entry_igpu';
      } else {
        tier = 'dedicated_high';
      }
    } else if (vendor.includes('intel') || desc.includes('intel')) {
      if (desc.includes('arc a7') || desc.includes('arc a5') || desc.includes('battlemage') || desc.includes('arc pro') || desc.includes('alchemist')) {
        tier = 'dedicated_high';
      } else if (desc.includes('arc') || desc.includes('iris')) {
        tier = 'balanced_igpu';
      } else {
        tier = 'entry_igpu';
      }
    } else if (vendor.includes('amd') || desc.includes('amd') || desc.includes('radeon')) {
      if (isAmdRenoirLucienne || desc.includes('graphics') || desc.includes('vega') || desc.includes('integrated') || desc.includes('cezanne') || desc.includes('lucienne')) {
        tier = 'balanced_igpu';
      } else if (desc.includes('rx') || desc.includes('radeon pro') || !desc.includes('graphics')) {
        tier = 'dedicated_high';
      } else {
        tier = 'balanced_igpu';
      }
    } else {
      tier = 'balanced_igpu';
    }

    isIGPU = tier !== 'dedicated_high';
  } catch {}

  const mode = options.mode || (tier === 'entry_igpu' ? 'fast' : 'modeA');

  const device = await adapter.requestDevice();

  const { ModeA, ModeB, ModeC, ModeAA, ModeCA, DenoiseCNNx2VL, CNNx2M } = await import(
    'anime4k-webgpu'
  );

  // Screen-conscious scaling:
  // - dedicated_high: up to 2.0x (4K: 3840x2160), max DPR 2.0
  // - balanced_igpu: up to 1.5x (1440p: 2560x1440), max DPR 1.25 to preserve memory bandwidth
  // - entry_igpu: up to 1.25x (1080p: 1920x1080), max DPR 1.0, defaulting to fast CNNx2M
  const maxFactor = tier === 'dedicated_high' ? 2.0 : tier === 'balanced_igpu' ? 1.5 : 1.25;
  const maxDpr = tier === 'dedicated_high' ? 2.0 : tier === 'balanced_igpu' ? 1.25 : 1.0;
  const maxW = tier === 'dedicated_high' ? 3840 : tier === 'balanced_igpu' ? 2560 : 1920;
  const maxH = tier === 'dedicated_high' ? 2160 : tier === 'balanced_igpu' ? 1440 : 1080;

  const dpr = Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, maxDpr);
  const sw = typeof screen !== 'undefined' ? screen.width : 1920;
  const sh = typeof screen !== 'undefined' ? screen.height : 1080;
  const scaleX = (sw * dpr) / inW;
  const scaleY = (sh * dpr) / inH;
  const k = Math.max(1, Math.min(maxFactor, scaleX, scaleY));

  const outW = Math.min(maxW, Math.round(inW * k));
  const outH = Math.min(maxH, Math.round(inH * k));

  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    throw new Error('Could not open WebGPU rendering context on player canvas');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  // Input intermediate texture
  const texUsage = typeof GPUTextureUsage !== 'undefined'
    ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    : 0x04 | 0x10;

  const input = device.createTexture({
    size: [inW, inH],
    format: 'rgba16float',
    usage: texUsage,
  });

  const dims = {
    nativeDimensions: { width: inW, height: inH },
    targetDimensions: { width: outW, height: outH },
  };

  let preset: any;
  switch (mode) {
    case 'modeB':
      preset = new ModeB({ device, inputTexture: input, ...dims });
      break;
    case 'modeC':
      preset = new ModeC({ device, inputTexture: input, ...dims });
      break;
    case 'modeAA':
      preset = new ModeAA({ device, inputTexture: input, ...dims });
      break;
    case 'modeCA':
      preset = new ModeCA({ device, inputTexture: input, ...dims });
      break;
    case 'denoise':
      preset = new DenoiseCNNx2VL({ device, inputTexture: input });
      break;
    case 'fast':
      preset = new CNNx2M({ device, inputTexture: input });
      break;
    case 'modeA':
    default:
      preset = new ModeA({ device, inputTexture: input, ...dims });
      break;
  }

  const module = device.createShaderModule({ code: WGSL });
  const makePipeline = (fragEntry: string, targetFormat: GPUTextureFormat) =>
    device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: fragEntry, targets: [{ format: targetFormat }] },
      primitive: { topology: 'triangle-list' },
    });

  const loadPipeline = makePipeline('fsExt', 'rgba16float');
  const renderPipeline = makePipeline('fs', format);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: preset.getOutputTexture().createView() },
    ],
  });

  const inView = input.createView();

  let alive = true;
  let animCallbackId = 0;
  let inFlight = 0;
  let droppedFrames = 0;
  let consecutiveSlowFrames = 0;
  let currentSplit = options.splitPercent ?? 100;

  console.info(`[VISION] Initializing WebGPU neural pipeline: preset=${mode}, tier=${tier}, input=${inW}x${inH}, target=${outW}x${outH} (${k.toFixed(2)}x)`);
  console.info(`[VISION] Active GPU Adapter: ${adapterName} (${tier})`);

  // Frame timing & rolling FPS calculations
  let frameCount = 0;
  let lastMetricTime = performance.now();
  let lastFrameTime = performance.now();
  let rollingFps = 60;
  let currentRenderMs = 0;

  // Gate 3 Protection: WebGPU Device Loss Listener
  device.lost?.then((info) => {
    if (alive) {
      alive = false;
      onBypass?.(info.message || 'WebGPU device was lost or reset');
    }
  });

  // Apply split-screen clipping
  const applyClip = (percent: number) => {
    currentSplit = percent;
    if (percent >= 99) {
      canvas.style.clipPath = 'none';
    } else {
      // Exposes original video on left half, AI enhanced on right half
      const rightReveal = Math.max(0, Math.min(100, 100 - percent));
      canvas.style.clipPath = `inset(0 0 0 ${rightReveal}%)`;
    }
  };

  applyClip(currentSplit);

  const drawFrame = () => {
    if (!alive || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    // Pipeline backpressure guard: maximum 2 command buffers in-flight
    if (inFlight >= 2) {
      droppedFrames++;
      return;
    }

    inFlight++;
    const t0 = performance.now();

    try {
      const enc = device.createCommandEncoder();

      // Pass 1: Import external video texture from hardware decoder
      const loadPass = enc.beginRenderPass({
        colorAttachments: [{ view: inView, loadOp: 'clear', storeOp: 'store' }],
      });
      loadPass.setPipeline(loadPipeline);
      loadPass.setBindGroup(
        0,
        device.createBindGroup({
          layout: loadPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: device.importExternalTexture({ source: video }) },
          ],
        }),
      );
      loadPass.draw(3);
      loadPass.end();

      // Pass 2: Execute Anime4K CNN compute / render passes
      preset.pass(enc);

      // Pass 3: Blit output texture to canvas
      const blitPass = enc.beginRenderPass({
        colorAttachments: [
          { view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' },
        ],
      });
      blitPass.setPipeline(renderPipeline);
      blitPass.setBindGroup(0, renderBindGroup);
      blitPass.draw(3);
      blitPass.end();

      device.queue.submit([enc.finish()]);

      // Track authentic GPU execution completion and latency
      device.queue
        .onSubmittedWorkDone()
        .then(() => {
          inFlight = Math.max(0, inFlight - 1);
          const t1 = performance.now();
          currentRenderMs = Math.round((t1 - t0) * 10) / 10;

          // Adaptive Quality Watchdog:
          // Target budget: 30.0ms (preserves smooth 30 FPS video playback on 60Hz display).
          const slowThresholdMs = 30.0;
          if (currentRenderMs > slowThresholdMs) {
            consecutiveSlowFrames++;
            if (consecutiveSlowFrames >= 8) {
              consecutiveSlowFrames = 0;
              // Multi-tiered Adaptive Degradation Ladder
              if (mode === 'modeCA' || mode === 'modeC' || mode === 'modeAA' || mode === 'denoise') {
                onDegrade?.('modeA');
              } else if (mode === 'modeA' || mode === 'modeB') {
                onDegrade?.('fast');
              } else if (mode === 'fast') {
                // If even the fastest preset exceeds hardware budget, bypass enhancement to protect playback
                onBypass?.('GPU rendering latency exceeded 30ms budget; enhancement bypassed to preserve smooth video playback.');
              }
            }
          } else {
            consecutiveSlowFrames = Math.max(0, consecutiveSlowFrames - 1);
          }
        })
        .catch(() => {
          inFlight = Math.max(0, inFlight - 1);
        });
    } catch {
      inFlight = Math.max(0, inFlight - 1);
    }

    // Telemetry updates
    const now = performance.now();
    frameCount++;
    if (now - lastMetricTime >= 500) {
      const elapsed = (now - lastMetricTime) / 1000;
      rollingFps = Math.round((frameCount / elapsed) * 10) / 10;
      frameCount = 0;
      lastMetricTime = now;

      onMetrics?.({
        inputWidth: inW,
        inputHeight: inH,
        outputWidth: outW,
        outputHeight: outH,
        currentFps: rollingFps,
        renderTimeMs: currentRenderMs,
        droppedFrames,
        adapterName,
        preset: mode,
        active: alive,
        watchdogStatus: consecutiveSlowFrames > 5 ? 'warning' : consecutiveSlowFrames > 2 ? 'degraded' : 'optimal',
        gpuTier: tier,
      });
    }
    lastFrameTime = now;
  };

  const renderLoop = () => {
    drawFrame();
    if (alive) {
      animCallbackId = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(renderLoop)
        : requestAnimationFrame(renderLoop);
    }
  };

  const onVideoAction = () => {
    if (alive) drawFrame();
  };
  video.addEventListener('seeked', onVideoAction);
  video.addEventListener('play', onVideoAction);
  video.addEventListener('playing', onVideoAction);
  video.addEventListener('timeupdate', onVideoAction);

  renderLoop();

  return {
    stop: () => {
      alive = false;
      console.info('[VISION] WebGPU live enhancement stopped');
      video.removeEventListener('seeked', onVideoAction);
      video.removeEventListener('play', onVideoAction);
      video.removeEventListener('playing', onVideoAction);
      video.removeEventListener('timeupdate', onVideoAction);
      if (video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(animCallbackId);
      } else {
        cancelAnimationFrame(animCallbackId);
      }
      try {
        input.destroy();
      } catch {}
      try {
        ctx.unconfigure();
      } catch {}
      try {
        device.destroy();
      } catch {}
    },
    setSplitPercent: (pct: number) => {
      applyClip(pct);
    },
  };
}

if (typeof window !== 'undefined') {
  (window as any).__startVisionLive = startVisionLive;
  (window as any).__gpuSupported = gpuSupported;
}
