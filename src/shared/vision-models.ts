import type { InferenceProvider } from './vision-types';

export type VisionModelArchitecture = 'esrgan' | 'anime4k' | 'compact' | 'swinir';
export type VisionModelCategory = 'anime-restoration' | 'general-upscale' | 'fast-playback';

export interface VisionModelManifest {
  id: string;
  displayName: string;
  version: string;
  architecture: VisionModelArchitecture;
  category: VisionModelCategory;
  scale: 2 | 4;
  inputChannels: number;
  outputChannels: number;
  supportedProviders: InferenceProvider[];
  minVramMb: number;
  sha256: string;
  fileSizeBytes: number;
  publisher: string;
  license: string;
  commercialUse: boolean;
  downloadUrl: string;
  localFileName: string;
  isBundled: boolean;
  limitations: string[];
}

export interface ModelVerificationResult {
  modelId: string;
  valid: boolean;
  exists: boolean;
  fileSizeBytes?: number;
  expectedSha256: string;
  actualSha256?: string;
  error?: string;
}

export interface InferenceBenchmarkResult {
  modelId: string;
  provider: InferenceProvider;
  latencyMs: number;
  memoryMb: number;
  inputDims: [number, number, number, number];
  outputDims: [number, number, number, number];
  success: boolean;
  error?: string;
}

