export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
export type GpuType = 'dedicated' | 'integrated' | 'virtual' | 'unknown';

export type InferenceProvider =
  | 'cuda'
  | 'tensorrt'
  | 'directml'
  | 'openvino'
  | 'coreml'
  | 'webgpu'
  | 'cpu';

export type CapabilityProfile =
  | 'basic'
  | 'balanced'
  | 'advanced'
  | 'high_performance'
  | 'unsupported';

export interface VisionHardwareDevice {
  id: string;
  vendor: GpuVendor;
  model: string;
  deviceId?: string;
  type: GpuType;
  driverVersion?: string;
  vramMb?: number;
  isPrimary: boolean;
}

export interface VisionProviderStatus {
  provider: InferenceProvider;
  available: boolean;
  validated: boolean;
  version?: string;
  reason?: string;
}

export interface MediaBackendInfo {
  ffmpegPath?: string;
  ffmpegVersion?: string;
  ffprobePath?: string;
  hwaccels: string[];
  codecs: {
    h264: boolean;
    hevc: boolean;
    av1: boolean;
    vp9: boolean;
  };
}

export interface VisionCapabilityProfile {
  profile: CapabilityProfile;
  liveEligible: boolean;
  offlineEligible: boolean;
  maxTargetResolution: '720p' | '1080p' | '1440p' | '4k' | '8k';
  recommendedInputResolution: string;
  recommendedOutputResolution: string;
  memoryBudgetMb: number;
  estimatedFpsRange: [number, number];
  limitations: string[];
}

export interface VisionHardwareProfile {
  devices: VisionHardwareDevice[];
  selectedDevice: VisionHardwareDevice | null;
  providers: VisionProviderStatus[];
  mediaBackend: MediaBackendInfo;
  profile: VisionCapabilityProfile;
  os: {
    platform: string;
    arch: string;
    release: string;
  };
}

export interface DiagnosticCheckItem {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface VisionDiagnosticsReport {
  timestamp: number;
  passed: boolean;
  hardware: VisionHardwareProfile;
  checks: DiagnosticCheckItem[];
  benchmark?: {
    smallInferenceMs?: number;
    memoryUsageMb?: number;
    status: 'ok' | 'failed' | 'skipped';
    error?: string;
  };
  recommendations: string[];
}

export interface VisionWorkerStatus {
  state: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
  pid?: number;
  uptimeSeconds?: number;
  crashCount: number;
  lastError?: string;
  lastHeartbeat?: number;
}

