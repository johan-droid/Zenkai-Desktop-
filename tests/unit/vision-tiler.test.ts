import { describe, expect, it } from 'vitest';
import {
  blendUpscaledTiles,
  computeTileGrid,
  estimateTensorMemoryMb,
  requiresTiling,
} from '../../src/main/vision/engine/tiler';

describe('Vision Tiled Inference & Memory Management', () => {
  it('accurately estimates tensor memory requirements for standard resolutions', () => {
    // 720p (1280 x 720) 2x scale
    const mem720p = estimateTensorMemoryMb(1280, 720, 2);
    expect(mem720p).toBeGreaterThan(50);
    expect(mem720p).toBeLessThan(350);

    // 1080p (1920 x 1080) 4x scale (Target: 4K)
    const mem1080p = estimateTensorMemoryMb(1920, 1080, 4);
    expect(mem1080p).toBeGreaterThan(400);

    // 4K (3840 x 2160) 2x scale (Target: 8K)
    const mem4k = estimateTensorMemoryMb(3840, 2160, 2);
    expect(mem4k).toBeGreaterThan(1500);
  });

  it('determines when a frame requires tiling based on qualified budget', () => {
    // 1080p -> 4K requires ~1.8GB layer activations; should tile on 1.5GB budget
    expect(requiresTiling(1920, 1080, 4, 1536)).toBe(true);

    // 720p -> 1080p on 6GB high performance GPU should not need tiling
    expect(requiresTiling(1280, 720, 2, 6144)).toBe(false);

    // 4K -> 8K always mandates tiling on consumer GPUs
    expect(requiresTiling(3840, 2160, 2, 4096)).toBe(true);
  });

  it('decomposes frame into complete overlapping tiles covering full frame', () => {
    const width = 1280;
    const height = 720;
    const tileSize = 512;
    const overlap = 32;

    const tiles = computeTileGrid(width, height, tileSize, overlap);
    expect(tiles.length).toBeGreaterThan(1);

    // Verify bounds cover borders
    expect(tiles[0].x).toBe(0);
    expect(tiles[0].y).toBe(0);

    // Check last tile reaches the end of the frame
    const maxX = Math.max(...tiles.map((t) => t.x + t.width));
    const maxY = Math.max(...tiles.map((t) => t.y + t.height));
    expect(maxX).toBe(width);
    expect(maxY).toBe(height);
  });

  it('blends upscaled tiles seamlessly back into destination canvas', () => {
    const srcW = 100;
    const srcH = 100;
    const scale = 2;
    const channels = 3;

    // Simulate 2 tiles
    const tile1Bounds = {
      index: 0,
      x: 0,
      y: 0,
      width: 60,
      height: 100,
      padLeft: 0,
      padTop: 0,
      padRight: 10,
      padBottom: 0,
    };

    const tile2Bounds = {
      index: 1,
      x: 50,
      y: 0,
      width: 50,
      height: 100,
      padLeft: 10,
      padTop: 0,
      padRight: 0,
      padBottom: 0,
    };

    const tile1Data = new Float32Array(channels * 200 * 120).fill(0.5);
    const tile2Data = new Float32Array(channels * 200 * 100).fill(0.8);

    const blended = blendUpscaledTiles(
      [
        { data: tile1Data, bounds: tile1Bounds },
        { data: tile2Data, bounds: tile2Bounds },
      ],
      srcW,
      srcH,
      scale,
      channels,
    );

    expect(blended.length).toBe(channels * (srcH * scale) * (srcW * scale));
    expect(blended[0]).toBe(0.5);
  });
});

