import { describe, expect, it } from 'vitest';
import { VisionInferenceEngine } from '../../src/main/vision/engine/inference-engine';

describe('Vision Inference Engine & Provider Abstraction', () => {
  it('instantiates and provides initial memory usage', () => {
    const engine = new VisionInferenceEngine();
    const mem = engine.getMemoryUsage();

    expect(mem.currentMb).toBeGreaterThan(0);
    expect(mem.peakMb).toBeGreaterThanOrEqual(0);
  });

  it('runs synthetic benchmark and calculates proper output tensor dimensions', async () => {
    const engine = new VisionInferenceEngine();
    const res = await engine.runBenchmark('real-esrgan-animevideo-v3', 'cpu', [1, 3, 256, 256]);

    expect(res.success).toBe(true);
    expect(res.modelId).toBe('real-esrgan-animevideo-v3');
    expect(res.inputDims).toEqual([1, 3, 256, 256]);
    // 4x scale for Real-ESRGAN
    expect(res.outputDims).toEqual([1, 3, 1024, 1024]);
    expect(res.latencyMs).toBeGreaterThan(0);
    expect(res.memoryMb).toBeGreaterThan(0);
  });

  it('handles 2x scaling models correctly', async () => {
    const engine = new VisionInferenceEngine();
    const res = await engine.runBenchmark('compact3-anime-fast', 'cpu', [1, 3, 256, 256]);

    expect(res.success).toBe(true);
    // 2x scale for Compact3
    expect(res.outputDims).toEqual([1, 3, 512, 512]);
  });

  it('gracefully releases resources on engine release()', async () => {
    const engine = new VisionInferenceEngine();
    await expect(engine.release()).resolves.toBeUndefined();
  });
});

