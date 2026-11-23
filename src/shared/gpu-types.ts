export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
export type GpuType = 'dedicated' | 'integrated' | 'virtual' | 'unknown';

export interface GpuDevice {
  id: string;
  vendor: GpuVendor;
  model: string;
  deviceId?: string;
  type: GpuType;
  driverVersion?: string;
  vramMb?: number;
  isPrimary: boolean;
}

export type VisionHardwareDevice = GpuDevice;

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
  devices: GpuDevice[];
  primaryDevice: GpuDevice | null;
  webGpuStatus: GpuDiagnosticState;
  videoDecodeStatus: GpuDiagnosticState;
  activeDecoder?: string;
  backend: 'vulkan' | 'd3d12' | 'metal' | 'opengl' | 'software' | 'unknown';
  gpuFeatureStatus?: Record<string, string>;
  details: string[];
}
