import type { VisionHardwareDevice } from './vision-types';

export type GpuDiagnosticState =
  | 'DETECTED'
  | 'AVAILABLE'
  | 'INITIALIZED'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'FALLBACK'
  | 'UNSUPPORTED'
  | 'FAILED'
  | 'UNKNOWN';

export interface UnifiedGpuDiagnostics {
  timestamp: number;
  platform: NodeJS.Platform;
  gpuPreference: 'auto' | 'high-performance' | 'power-saving';
  devices: VisionHardwareDevice[];
  primaryDevice: VisionHardwareDevice | null;
  webGpuStatus: GpuDiagnosticState;
  videoDecodeStatus: GpuDiagnosticState;
  activeDecoder?: string;
  backend: 'vulkan' | 'd3d12' | 'metal' | 'opengl' | 'software' | 'unknown';
  gpuFeatureStatus?: Record<string, string>;
  details: string[];
}

