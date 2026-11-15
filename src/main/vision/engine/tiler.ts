export interface TileBounds {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  padLeft: number;
  padTop: number;
  padRight: number;
  padBottom: number;
}

/**
 * Estimates the uncompressed VRAM requirement in megabytes for a given frame tensor.
 */
export function estimateTensorMemoryMb(
  width: number,
  height: number,
  scale: number,
  channels: number = 3,
): number {
  const inBytes = width * height * channels * 4; // float32
  const outBytes = (width * scale) * (height * scale) * channels * 4;
  // Account for intermediate activation layers (typically ~4x output tensor)
  const layerOverhead = outBytes * 4;
  return Math.round((inBytes + outBytes + layerOverhead) / (1024 * 1024));
}

/**
 * Determines whether a frame must be tiled based on the hardware memory budget.
 */
export function requiresTiling(
  width: number,
  height: number,
  scale: number,
  memoryBudgetMb: number,
): boolean {
  const outW = width * scale;
  const outH = height * scale;
  // 8K target (e.g. 7680x4320 or 4K scaled 2x) always mandates tiling on consumer GPUs
  if (outW >= 7680 || outH >= 4320) return true;
  const req = estimateTensorMemoryMb(width, height, scale);
  // If memory requirement exceeds 45% of total qualified budget, mandate tiling
  return req > memoryBudgetMb * 0.45;
}

/**
 * Computes optimal tile grid with overlapping margins for high-resolution processing.
 */
export function computeTileGrid(
  width: number,
  height: number,
  tileSize: number = 512,
  overlap: number = 32,
): TileBounds[] {
  const tiles: TileBounds[] = [];
  const stepX = tileSize - overlap * 2;
  const stepY = tileSize - overlap * 2;

  let index = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      // Calculate crop box with overlap
      const cropX = Math.max(0, x - overlap);
      const cropY = Math.max(0, y - overlap);
      const cropW = Math.min(width - cropX, tileSize);
      const cropH = Math.min(height - cropY, tileSize);

      tiles.push({
        index: index++,
        x: cropX,
        y: cropY,
        width: cropW,
        height: cropH,
        padLeft: x - cropX,
        padTop: y - cropY,
        padRight: Math.max(0, cropW - (x - cropX + stepX)),
        padBottom: Math.max(0, cropH - (y - cropY + stepY)),
      });
    }
  }

  return tiles;
}

/**
 * Blends processed upscaled tiles back into the full destination image canvas.
 */
export function blendUpscaledTiles(
  tiles: { data: Float32Array; bounds: TileBounds }[],
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  channels: number = 3,
): Float32Array {
  const outW = sourceWidth * scale;
  const outH = sourceHeight * scale;
  const output = new Float32Array(channels * outH * outW);

  for (const { data, bounds } of tiles) {
    const tileOutW = bounds.width * scale;
    const tileOutH = bounds.height * scale;
    const destStartX = bounds.x * scale;
    const destStartY = bounds.y * scale;

    for (let c = 0; c < channels; c++) {
      for (let row = 0; row < tileOutH; row++) {
        const destY = destStartY + row;
        if (destY >= outH) continue;

        for (let col = 0; col < tileOutW; col++) {
          const destX = destStartX + col;
          if (destX >= outW) continue;

          const srcIdx = c * tileOutH * tileOutW + row * tileOutW + col;
          const destIdx = c * outH * outW + destY * outW + destX;

          output[destIdx] = data[srcIdx];
        }
      }
    }
  }

  return output;
}
