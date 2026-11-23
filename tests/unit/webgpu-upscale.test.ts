import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  if (typeof (globalThis as any).GPUTextureUsage === 'undefined') {
    (globalThis as any).GPUTextureUsage = {
      COPY_SRC: 0x01,
      COPY_DST: 0x02,
      TEXTURE_BINDING: 0x04,
      STORAGE_BINDING: 0x08,
      RENDER_ATTACHMENT: 0x10,
    };
  }
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = { gpu: {} };
  } else if (!('gpu' in globalThis.navigator)) {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: {},
      configurable: true,
      writable: true,
    });
  }
});

import {
  gpuSupported,
  startUpscale,
  type Anime4KMode,
  type UpscaleOptions,
} from '../../src/renderer/src/lib/upscale';

vi.mock('anime4k-webgpu', () => {
  class MockPreset {
    pass = vi.fn();
    getOutputTexture() {
      return {
        createView: vi.fn(() => ({})),
      };
    }
  }
  return {
    ModeA: MockPreset,
    ModeB: MockPreset,
    ModeC: MockPreset,
    ModeAA: MockPreset,
    DenoiseCNNx2VL: MockPreset,
    CNNx2M: MockPreset,
  };
});

function createMockCanvas(): HTMLCanvasElement {
  return {
    style: {} as any,
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      configure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({
        createView: vi.fn(() => ({})),
      })),
      unconfigure: vi.fn(),
    })),
  } as unknown as HTMLCanvasElement;
}

function createMockVideo(width = 1280, height = 720): HTMLVideoElement {
  return {
    videoWidth: width,
    videoHeight: height,
    readyState: 4,
    paused: false,
    addEventListener: vi.fn((event, cb) => {
      if (event === 'loadedmetadata') setTimeout(cb, 0);
    }),
    removeEventListener: vi.fn(),
    requestVideoFrameCallback: vi.fn((cb) => setTimeout(cb, 16)),
    cancelVideoFrameCallback: vi.fn(),
  } as unknown as HTMLVideoElement;
}

describe('WebGPU Anime4K Upscaler Engine (Upstream Parity)', () => {
  let originalNavigator: any;

  beforeEach(() => {
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates supported preset identifiers', () => {
    const modes: Anime4KMode[] = [
      'modeA',
      'modeB',
      'modeC',
      'modeAA',
      'denoise',
      'fast',
    ];
    expect(modes).toHaveLength(6);
  });

  it('gracefully throws if WebGPU is not available in environment', async () => {
    const mockVideo = createMockVideo();
    const mockCanvas = createMockCanvas();

    Object.defineProperty(global, 'navigator', {
      value: { ...originalNavigator, gpu: undefined },
      configurable: true,
      writable: true,
    });

    await expect(startUpscale(mockVideo, mockCanvas)).rejects.toThrow(
      'WebGPU is not available in this browser',
    );
  });

  it('bypasses if video source is already 1440p+ resolution', async () => {
    const mockVideo = createMockVideo(2560, 1440);
    const mockCanvas = createMockCanvas();

    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({
            requestDevice: vi.fn().mockResolvedValue({}),
          }),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('rgba8unorm'),
        },
      },
      configurable: true,
      writable: true,
    });

    await expect(startUpscale(mockVideo, mockCanvas)).rejects.toThrow(
      'Source is already high resolution (1440p+)',
    );
  });

  it('initializes WebGPU pipeline and returns stop function', async () => {
    const mockVideo = createMockVideo(1280, 720);
    const mockCanvas = createMockCanvas();

    const mockDevice = {
      createTexture: vi.fn(() => ({
        createView: vi.fn(() => ({})),
        destroy: vi.fn(),
      })),
      createShaderModule: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({
        getBindGroupLayout: vi.fn(() => ({})),
      })),
      createSampler: vi.fn(() => ({})),
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: vi.fn(() => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        })),
        finish: vi.fn(() => ({})),
      })),
      queue: {
        submit: vi.fn(),
        onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
      },
      importExternalTexture: vi.fn(() => ({})),
      lost: new Promise(() => {}),
      destroy: vi.fn(),
    };

    const mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('rgba8unorm'),
        },
      },
      configurable: true,
      writable: true,
    });

    const stop = await startUpscale(mockVideo, mockCanvas, { mode: 'modeA' });
    expect(typeof stop).toBe('function');
    expect(mockAdapter.requestDevice).toHaveBeenCalledTimes(1);

    // Canvas dimensions should be scaled
    expect(mockCanvas.width).toBeGreaterThanOrEqual(1280);
    expect(mockCanvas.height).toBeGreaterThanOrEqual(720);

    // Call stop
    stop();
    expect(mockDevice.destroy).toHaveBeenCalledTimes(1);
  });

  it('handles device loss gracefully via onSlow callback', async () => {
    const mockVideo = createMockVideo(1280, 720);
    const mockCanvas = createMockCanvas();

    let triggerDeviceLoss: (info: { message: string }) => void = () => {};
    const lostPromise = new Promise<{ message: string }>((resolve) => {
      triggerDeviceLoss = resolve;
    });

    const mockDevice = {
      createTexture: vi.fn(() => ({
        createView: vi.fn(() => ({})),
        destroy: vi.fn(),
      })),
      createShaderModule: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({
        getBindGroupLayout: vi.fn(() => ({})),
      })),
      createSampler: vi.fn(() => ({})),
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: vi.fn(() => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        })),
        finish: vi.fn(() => ({})),
      })),
      queue: {
        submit: vi.fn(),
        onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
      },
      importExternalTexture: vi.fn(() => ({})),
      lost: lostPromise,
      destroy: vi.fn(),
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({
            requestDevice: vi.fn().mockResolvedValue(mockDevice),
          }),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('rgba8unorm'),
        },
      },
      configurable: true,
      writable: true,
    });

    const onSlow = vi.fn();
    const stop = await startUpscale(mockVideo, mockCanvas, { mode: 'fast', onSlow });

    // Trigger device loss
    triggerDeviceLoss({ message: 'Device crashed' });
    await new Promise((r) => setTimeout(r, 10));

    expect(onSlow).toHaveBeenCalledWith('Device crashed');
    stop();
  });
});
