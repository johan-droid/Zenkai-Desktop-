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
  watchdogStatus: 'optimal' | 'warning' | 'bypassed';
}

export interface VisionLiveOptions {
  mode?: VisionLivePreset;
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
  const mode = options.mode || 'modeA';
  const onBypass = options.onBypass;
  const onDegrade = options.onDegrade;
  const onMetrics = options.onMetrics;

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser environment');
  }

  // Await metadata to obtain native dimensions
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      const onDone = () => {
        video.removeEventListener('loadedmetadata', onDone);
        video.removeEventListener('loadeddata', onDone);
        video.removeEventListener('canplay', onDone);
        resolve();
      };
      video.addEventListener('loadedmetadata', onDone);
      video.addEventListener('loadeddata', onDone);
      video.addEventListener('canplay', onDone);
      setTimeout(onDone, 1200);
    });
  }

  const inW = video.videoWidth || 1920;
  const inH = video.videoHeight || 1080;

  if (inH >= 2160 && inW >= 3840) {
    throw new Error('Video source is already 4K native resolution; live enhancement bypassed.');
  }

  let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) {
    adapter = await navigator.gpu.requestAdapter().catch(() => null);
  }
  if (!adapter) {
    throw new Error('No compatible GPU adapter found for WebGPU live processing');
  }

  let adapterName = 'GPU Adapter';
  let isIGPU = false;
  try {
    const info = (adapter as any).info || (await (adapter as any).requestAdapterInfo?.()) || {};
    const desc = (info.description || info.device || '').toLowerCase();
    const vendor = (info.vendor || '').toLowerCase();
    const arch = (info.architecture || '').toLowerCase();
    if (info.description || info.device) {
      adapterName = info.description || info.device;
    } else if (info.vendor) {
      adapterName = `${info.vendor.toUpperCase()}${arch ? ` (${arch})` : ''} GPU`;
    }
    isIGPU =
      desc.includes('intel') ||
      desc.includes('uhd') ||
      desc.includes('iris') ||
      desc.includes('vega') ||
      desc.includes('lucienne') ||
      desc.includes('renoir') ||
      desc.includes('cezanne') ||
      desc.includes('radeon graphics') ||
      desc.includes('integrated') ||
      vendor.includes('intel') ||
      (vendor.includes('amd') && (desc.includes('graphics') || !desc.includes('radeon rx') || (typeof navigator !== 'undefined' && ((navigator as any).deviceMemory || 8) <= 8)));
  } catch {}

  const device = await adapter.requestDevice();

  const { ModeA, ModeB, ModeC, ModeAA, ModeCA, DenoiseCNNx2VL, CNNx2M } = await import(
    'anime4k-webgpu'
  );

  // Screen-conscious scaling: on iGPU cap to native display (1.5x / 1440p) to preserve memory bandwidth; on dGPU allow 2x / 4K
  const dpr = Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, isIGPU ? 1.25 : 2);
  const sw = typeof screen !== 'undefined' ? screen.width : 1920;
  const sh = typeof screen !== 'undefined' ? screen.height : 1080;
  const scaleX = (sw * dpr) / inW;
  const scaleY = (sh * dpr) / inH;
  const maxFactor = isIGPU ? 1.5 : 2;
  const k = Math.max(1, Math.min(maxFactor, scaleX, scaleY));

  const maxW = isIGPU ? 2560 : 3840;
  const maxH = isIGPU ? 1440 : 2160;
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
    if (!alive || video.readyState < 2) return;

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

      // Sample GPU latency asynchronously without stalling the pipeline every single frame
      const isSampleFrame = frameCount % 8 === 0;
      if (isSampleFrame) {
        device.queue
          .onSubmittedWorkDone()
          .then(() => {
            inFlight = Math.max(0, inFlight - 1);
            const t1 = performance.now();
            currentRenderMs = Math.round((t1 - t0) * 10) / 10;

            // Watchdog: auto-switch to fast preset if frame time consistently exceeds 50ms (below 20 FPS)
            if (currentRenderMs > 50) {
              consecutiveSlowFrames++;
              if (consecutiveSlowFrames >= 8) {
                if (mode !== 'fast' && onDegrade) {
                  consecutiveSlowFrames = 0;
                  onDegrade('fast');
                }
              }
            } else {
              consecutiveSlowFrames = Math.max(0, consecutiveSlowFrames - 1);
            }
          })
          .catch(() => {
            inFlight = Math.max(0, inFlight - 1);
          });
      } else {
        // Fast-path queue clearance for intermediate frames
        Promise.resolve().then(() => {
          inFlight = Math.max(0, inFlight - 1);
        });
      }
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
        watchdogStatus: consecutiveSlowFrames > 5 ? 'warning' : 'optimal',
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

  renderLoop();

  return {
    stop: () => {
      alive = false;
      if (video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(animCallbackId);
      } else {
        cancelAnimationFrame(animCallbackId);
      }
      try {
        device.destroy();
      } catch {}
    },
    setSplitPercent: (pct: number) => {
      applyClip(pct);
    },
  };
}
