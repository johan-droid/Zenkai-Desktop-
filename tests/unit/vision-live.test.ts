import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startVisionLive,
  type VisionLivePreset,
} from '../../src/renderer/src/lib/vision-live';

// Polyfill WebGPU globals for Node test environment
if (typeof (globalThis as any).GPUTextureUsage === 'undefined') {
  (globalThis as any).GPUTextureUsage = {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  };
}

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
    ModeCA: MockPreset,
    DenoiseCNNx2VL: MockPreset,
    CNNx2M: MockPreset,
  };
});

function createMockCanvas(): HTMLCanvasElement {
  return {
    style: {} as any,
    width: 0,
    height: 0,
    getContext: vi.fn(),
  } as unknown as HTMLCanvasElement;
}

describe('Zenkai Vision Live Engine (Gate 3 Bypass & Watchdog)', () => {
  let originalNavigator: any;

  beforeEach(() => {
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates supported preset identifiers', () => {
    const presets: VisionLivePreset[] = [
      'modeA',
      'modeB',
      'modeC',
      'modeAA',
      'modeCA',
      'denoise',
      'fast',
    ];
    expect(presets).toHaveLength(7);
  });

  it('gracefully throws if WebGPU is not supported by environment', async () => {
    const mockVideo = {
      videoWidth: 1280,
      videoHeight: 720,
    } as unknown as HTMLVideoElement;

    const mockCanvas = createMockCanvas();

    // Force navigator without gpu
    Object.defineProperty(global, 'navigator', {
      value: { ...originalNavigator, gpu: undefined },
      configurable: true,
      writable: true,
    });

    await expect(startVisionLive(mockVideo, mockCanvas)).rejects.toThrow(
      'WebGPU is not supported by this browser environment',
    );
  });

  it('bypasses if video source is already native 4K resolution', async () => {
    const mockVideo = {
      videoWidth: 3840,
      videoHeight: 2160,
    } as unknown as HTMLVideoElement;

    const mockCanvas = createMockCanvas();

    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn(),
          getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
        },
      },
      configurable: true,
      writable: true,
    });

    await expect(startVisionLive(mockVideo, mockCanvas)).rejects.toThrow(
      'already 4K native resolution',
    );
  });

  it('verifies split comparison clipping logic without stalling playback', async () => {
    const mockDestroy = vi.fn();
    const mockLostPromise = new Promise(() => {});

    const mockDevice = {
      lost: mockLostPromise,
      destroy: mockDestroy,
      createTexture: vi.fn(() => ({
        createView: vi.fn(() => ({})),
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
        finish: vi.fn(),
      })),
      importExternalTexture: vi.fn(() => ({})),
      queue: {
        submit: vi.fn(),
        onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
      },
    };

    const mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
      info: { device: 'NVIDIA RTX Mock' },
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
        },
      },
      configurable: true,
      writable: true,
    });

    const mockVideo = {
      videoWidth: 1920,
      videoHeight: 1080,
      readyState: 4,
      requestVideoFrameCallback: vi.fn((cb) => setTimeout(cb, 16)),
      cancelVideoFrameCallback: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;

    const mockCanvas = createMockCanvas();
    const mockConfigure = vi.fn();
    const mockGetCurrentTexture = vi.fn(() => ({
      createView: vi.fn(() => ({})),
    }));

    (mockCanvas.getContext as any) = vi.fn().mockReturnValue({
      configure: mockConfigure,
      getCurrentTexture: mockGetCurrentTexture,
    });

    const onMetrics = vi.fn();
    const onBypass = vi.fn();

    const handle = await startVisionLive(mockVideo, mockCanvas, {
      mode: 'fast',
      splitPercent: 50,
      onMetrics,
      onBypass,
    });

    // 50% split should set clipPath to reveal left half
    expect(mockCanvas.style.clipPath).toBe('inset(0 0 0 50%)');

    // Dynamic slider update
    handle.setSplitPercent(70);
    expect(mockCanvas.style.clipPath).toBe('inset(0 0 0 30%)');

    // Full screen restore
    handle.setSplitPercent(100);
    expect(mockCanvas.style.clipPath).toBe('none');

    // Clean instantaneous bypass / stop
    handle.stop();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalled();
  });

  it('triggers onBypass immediately upon WebGPU device loss', async () => {
    let resolveDeviceLoss: (val: { message: string }) => void;
    const mockLostPromise = new Promise<{ message: string }>((res) => {
      resolveDeviceLoss = res;
    });

    const mockDevice = {
      lost: mockLostPromise,
      destroy: vi.fn(),
      createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) })),
      createShaderModule: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
      createSampler: vi.fn(() => ({})),
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: vi.fn(() => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        })),
        finish: vi.fn(),
      })),
      importExternalTexture: vi.fn(() => ({})),
      queue: { submit: vi.fn(), onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined) },
    };

    const mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
      info: { device: 'Mock GPU' },
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
        },
      },
      configurable: true,
      writable: true,
    });

    const mockVideo = {
      videoWidth: 1280,
      videoHeight: 720,
      readyState: 4,
      requestVideoFrameCallback: vi.fn(),
      cancelVideoFrameCallback: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;

    const mockCanvas = createMockCanvas();
    (mockCanvas.getContext as any) = vi.fn().mockReturnValue({
      configure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn() })),
    });

    const onBypass = vi.fn();

    const handle = await startVisionLive(mockVideo, mockCanvas, {
      mode: 'modeA',
      onBypass,
    });

    // Simulate unexpected GPU crash / device loss
    resolveDeviceLoss!({ message: 'Device reset by kernel driver' });

    // Allow promise resolution
    await new Promise((r) => setTimeout(r, 20));

    expect(onBypass).toHaveBeenCalledWith('Device reset by kernel driver');

    handle.stop();
  });
});
