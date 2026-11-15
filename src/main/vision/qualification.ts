import type {
  CapabilityProfile,
  VisionCapabilityProfile,
  VisionHardwareDevice,
  VisionHardwareProfile,
  VisionProviderStatus,
} from '../../shared/vision-types';
import { discoverGpus, discoverMediaBackend } from './hardware';
import { discoverProviders } from './providers';

/**
 * Assigns a capability profile based on verified device specifications and available providers.
 */
export function qualifyHardwareProfile(
  devices: VisionHardwareDevice[],
  providers: VisionProviderStatus[],
): VisionCapabilityProfile {
  const primary = devices.find((d) => d.isPrimary) || devices[0];
  const hasCuda = providers.some((p) => p.provider === 'cuda' && p.available);
  const hasDirectMl = providers.some((p) => p.provider === 'directml' && p.available);
  const hasCoreMl = providers.some((p) => p.provider === 'coreml' && p.available);

  if (!primary || primary.type === 'virtual') {
    return {
      profile: 'basic',
      liveEligible: false,
      offlineEligible: true,
      maxTargetResolution: '720p',
      recommendedInputResolution: '480p',
      recommendedOutputResolution: '720p',
      memoryBudgetMb: 512,
      estimatedFpsRange: [1, 5],
      limitations: ['Virtual/software render detected. Offline CPU processing only.'],
    };
  }

  const vram = primary.vramMb ?? (primary.type === 'dedicated' ? 4096 : 2048);

  // 1. High Performance: Dedicated GPU with >=8GB VRAM and accelerated compute
  if (primary.type === 'dedicated' && vram >= 8192 && (hasCuda || hasDirectMl)) {
    return {
      profile: 'high_performance',
      liveEligible: true,
      offlineEligible: true,
      maxTargetResolution: '8k',
      recommendedInputResolution: '1080p',
      recommendedOutputResolution: '4k',
      memoryBudgetMb: 6144,
      estimatedFpsRange: [30, 60],
      limitations: ['8K export requires tiled decomposition to prevent VRAM spikes.'],
    };
  }

  // 2. Advanced: Dedicated GPU with >=4GB VRAM, or Apple Silicon M-series
  if ((primary.type === 'dedicated' && vram >= 3500) || (primary.vendor === 'apple' && hasCoreMl)) {
    return {
      profile: 'advanced',
      liveEligible: true,
      offlineEligible: true,
      maxTargetResolution: '4k',
      recommendedInputResolution: '720p / 1080p',
      recommendedOutputResolution: '1440p / 4k',
      memoryBudgetMb: 3072,
      estimatedFpsRange: [15, 30],
      limitations: ['4K export supported; 8K disabled due to VRAM threshold.'],
    };
  }

  // 3. Balanced: Modern Integrated GPU (AMD Radeon/Vega, Intel Iris Xe) with shared memory
  if (primary.type === 'integrated' && (primary.vendor === 'amd' || primary.vendor === 'intel')) {
    return {
      profile: 'balanced',
      liveEligible: true,
      offlineEligible: true,
      maxTargetResolution: '1440p',
      recommendedInputResolution: '720p',
      recommendedOutputResolution: '1080p',
      memoryBudgetMb: 1536,
      estimatedFpsRange: [8, 18],
      limitations: [
        'Live enhancement uses optimized Anime4K WebGPU shaders.',
        'Offline batch export recommended up to 1080p/1440p.',
      ],
    };
  }

  // 4. Basic: Entry level hardware
  return {
    profile: 'basic',
    liveEligible: true,
    offlineEligible: true,
    maxTargetResolution: '1080p',
    recommendedInputResolution: '480p / 720p',
    recommendedOutputResolution: '1080p',
    memoryBudgetMb: 1024,
    estimatedFpsRange: [3, 10],
    limitations: [
      'Live enhancement limited to lightweight fast shaders.',
      'Offline processing uses multi-threaded CPU fallback.',
    ],
  };
}

/**
 * Builds the complete composite VisionHardwareProfile for the host system.
 */
export function getCompleteHardwareProfile(): VisionHardwareProfile {
  const devices = discoverGpus();
  const selectedDevice = devices.find((d) => d.isPrimary) || devices[0] || null;
  const providers = discoverProviders(devices);
  const mediaBackend = discoverMediaBackend();
  const profile = qualifyHardwareProfile(devices, providers);

  return {
    devices,
    selectedDevice,
    providers,
    mediaBackend,
    profile,
    os: {
      platform: process.platform,
      arch: process.arch,
      release: typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : 'unknown',
    },
  };
}

