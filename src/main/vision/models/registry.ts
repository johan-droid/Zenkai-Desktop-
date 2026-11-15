import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VisionModelManifest } from '../../../shared/vision-models';

export const OFFICIAL_MODEL_REGISTRY: VisionModelManifest[] = [
  {
    id: 'real-esrgan-animevideo-v3',
    displayName: 'Real-ESRGAN AnimeVideo v3',
    version: '3.0.0',
    architecture: 'esrgan',
    category: 'anime-restoration',
    scale: 4,
    inputChannels: 3,
    outputChannels: 3,
    supportedProviders: ['cuda', 'tensorrt', 'directml', 'openvino', 'coreml', 'cpu'],
    minVramMb: 2048,
    sha256: 'e737dc53a5ad742bf22ec024f95f8bd3a6db670ce0be79afb4d4b03335c9bf7c',
    fileSizeBytes: 17400000,
    publisher: 'Xintao Wang et al. (Tencent ARC / Real-ESRGAN)',
    license: 'BSD-3-Clause',
    commercialUse: true,
    downloadUrl: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x4.onnx',
    localFileName: 'realesr-animevideov3-x4.onnx',
    isBundled: false,
    limitations: [
      'High GPU computation. 4K/8K export requires tiled decomposition.',
      'Optimal for 2D animation lines and cell shading.',
    ],
  },
  {
    id: 'compact3-anime-fast',
    displayName: 'Compact3 Anime Fast',
    version: '1.2.0',
    architecture: 'compact',
    category: 'anime-restoration',
    scale: 2,
    inputChannels: 3,
    outputChannels: 3,
    supportedProviders: ['cuda', 'directml', 'openvino', 'coreml', 'cpu'],
    minVramMb: 1024,
    sha256: 'e381ec9059863b3e47583d0805e8de85d4919037e28700b5c50b2cf8b9acfba7',
    fileSizeBytes: 6200000,
    publisher: 'OpenModelDB / ChaiNNer Community',
    license: 'Apache-2.0',
    commercialUse: true,
    downloadUrl: 'https://github.com/OpenModelDB/models/releases/download/compact/compact3-anime-x2.onnx',
    localFileName: 'compact3-anime-x2.onnx',
    isBundled: false,
    limitations: [
      'Lightweight 2x scaling. Suitable for balanced iGPUs and CPU export.',
    ],
  },
  {
    id: 'anime4k-restore-cnn-vl',
    displayName: 'Anime4K Restore CNN (Very Large)',
    version: '4.0.1',
    architecture: 'anime4k',
    category: 'fast-playback',
    scale: 2,
    inputChannels: 3,
    outputChannels: 3,
    supportedProviders: ['webgpu', 'directml', 'openvino', 'cpu'],
    minVramMb: 512,
    sha256: 'c429b6fba2a96cf92cb375604016a431d05fec5b6c7842a491f45e08785b5b10',
    fileSizeBytes: 2400000,
    publisher: 'bloc97 (Anime4K)',
    license: 'MIT',
    commercialUse: true,
    downloadUrl: 'https://github.com/bloc97/Anime4K/releases/download/v4.0.1/Anime4K_Restore_CNN_VL.onnx',
    localFileName: 'anime4k_restore_cnn_vl.onnx',
    isBundled: true,
    limitations: [
      'Zero-copy WebGPU shader execution for real-time playback.',
      'Perceptual line reconstruction.',
    ],
  },
  {
    id: 'anime4k-denoise-fast',
    displayName: 'Anime4K Denoise & Line Enhance',
    version: '4.0.1',
    architecture: 'anime4k',
    category: 'fast-playback',
    scale: 2,
    inputChannels: 3,
    outputChannels: 3,
    supportedProviders: ['webgpu', 'directml', 'cpu'],
    minVramMb: 512,
    sha256: 'ad278dc28f7dbac43458323e8877a988eb501ca38e8e054438bf9c1780986e33',
    fileSizeBytes: 1200000,
    publisher: 'bloc97 (Anime4K)',
    license: 'MIT',
    commercialUse: true,
    downloadUrl: 'https://github.com/bloc97/Anime4K/releases/download/v4.0.1/Anime4K_Denoise_Bilinear.onnx',
    localFileName: 'anime4k_denoise_fast.onnx',
    isBundled: true,
    limitations: [
      'Optimized for fast frame rates on lower-end devices.',
    ],
  },
];

/**
 * Returns the base models directory on the user's filesystem.
 */
export function getVisionModelsDir(): string {
  if (process.env.ZENKAI_MODELS_DIR) {
    return process.env.ZENKAI_MODELS_DIR;
  }
  try {
    const { app } = require('electron');
    if (app?.getPath) {
      return path.join(app.getPath('userData'), 'vision-models');
    }
  } catch {}

  return path.join(os.homedir(), '.zenkai', 'vision-models');
}

/**
 * Ensures the models directory exists.
 */
export function ensureModelsDir(customDir?: string): string {
  const dir = customDir || getVisionModelsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Retrieves all registered model manifests.
 */
export function getAllModels(): VisionModelManifest[] {
  return OFFICIAL_MODEL_REGISTRY;
}

/**
 * Finds a registered model by its unique identifier.
 */
export function getModelById(id: string): VisionModelManifest | undefined {
  return OFFICIAL_MODEL_REGISTRY.find((m) => m.id === id);
}

/**
 * Resolves the absolute local filesystem path for a model if it exists on disk.
 */
export function resolveModelPath(id: string, customDir?: string): string | null {
  const model = getModelById(id);
  if (!model) return null;

  const baseDir = customDir || getVisionModelsDir();
  const target = path.join(baseDir, model.localFileName);

  if (fs.existsSync(target)) {
    return target;
  }

  // Check bundled path if model is marked as bundled
  if (model.isBundled) {
    const bundledCandidate = path.resolve(__dirname, '../../../resources/models', model.localFileName);
    if (fs.existsSync(bundledCandidate)) {
      return bundledCandidate;
    }
  }

  return null;
}
