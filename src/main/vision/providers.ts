import fs from 'node:fs';
import os from 'node:os';
import type {
  InferenceProvider,
  VisionHardwareDevice,
  VisionProviderStatus,
} from '../../shared/vision-types';
import type { CommandRunner } from './hardware';

const defaultRunner: CommandRunner = (cmd: string): string => {
  try {
    const { execSync } = require('node:child_process');
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 });
  } catch {
    return '';
  }
};

/**
 * Probes and qualifies available inference providers based on detected hardware, drivers, and platform.
 */
export function discoverProviders(
  devices: VisionHardwareDevice[],
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = defaultRunner,
): VisionProviderStatus[] {
  const hasNvidia = devices.some((d) => d.vendor === 'nvidia');
  const hasAmd = devices.some((d) => d.vendor === 'amd');
  const hasIntel = devices.some((d) => d.vendor === 'intel');
  const hasApple = devices.some((d) => d.vendor === 'apple');

  const providers: VisionProviderStatus[] = [];

  // 1. CUDA
  if (hasNvidia) {
    const smiOut = runner('nvidia-smi');
    if (smiOut && smiOut.includes('NVIDIA-SMI')) {
      const vMatch = smiOut.match(/Driver Version:\s*([0-9.]+)/i);
      providers.push({
        provider: 'cuda',
        available: true,
        validated: true,
        version: vMatch ? vMatch[1] : undefined,
      });
    } else {
      providers.push({
        provider: 'cuda',
        available: false,
        validated: false,
        reason: 'NVIDIA GPU detected, but nvidia-smi / CUDA driver was not found.',
      });
    }
  } else {
    providers.push({
      provider: 'cuda',
      available: false,
      validated: false,
      reason: 'No compatible NVIDIA hardware detected.',
    });
  }

  // 2. TensorRT
  if (hasNvidia && providers.find((p) => p.provider === 'cuda')?.available) {
    // Check for TensorRT libraries or CLI
    const trtCheck = runner('dpkg -l | grep -i nvinfer || ldconfig -p | grep -i nvinfer');
    if (trtCheck.includes('nvinfer')) {
      providers.push({
        provider: 'tensorrt',
        available: true,
        validated: true,
      });
    } else {
      providers.push({
        provider: 'tensorrt',
        available: false,
        validated: false,
        reason: 'TensorRT (libnvinfer) runtime not installed on host.',
      });
    }
  } else {
    providers.push({
      provider: 'tensorrt',
      available: false,
      validated: false,
      reason: 'Requires qualified NVIDIA CUDA hardware.',
    });
  }

  // 3. DirectML (Windows standard for AMD, Intel, and NVIDIA)
  if (platform === 'win32') {
    providers.push({
      provider: 'directml',
      available: true,
      validated: true,
      version: 'DirectX 12 / DirectML',
    });
  } else {
    providers.push({
      provider: 'directml',
      available: false,
      validated: false,
      reason: 'DirectML is exclusive to Windows 10/11.',
    });
  }

  // 4. OpenVINO (Intel CPU / iGPU / Arc)
  if (hasIntel) {
    providers.push({
      provider: 'openvino',
      available: true,
      validated: false, // validated once small inference benchmark runs
      version: 'Intel Gen Graphics / OpenVINO Compatible',
    });
  } else {
    providers.push({
      provider: 'openvino',
      available: false,
      validated: false,
      reason: 'Requires Intel CPU or GPU architecture.',
    });
  }

  // 5. CoreML (Apple Silicon / macOS)
  if (platform === 'darwin' || hasApple) {
    providers.push({
      provider: 'coreml',
      available: true,
      validated: true,
      version: 'Apple Neural Engine / Metal',
    });
  } else {
    providers.push({
      provider: 'coreml',
      available: false,
      validated: false,
      reason: 'CoreML is exclusive to macOS / Apple Silicon.',
    });
  }

  // 6. WebGPU (Always qualified for Chromium/Electron environment)
  providers.push({
    provider: 'webgpu',
    available: true,
    validated: true,
    version: 'Chromium WGSL Shader Pipeline',
  });

  // 7. CPU (Universal fallback)
  providers.push({
    provider: 'cpu',
    available: true,
    validated: true,
    version: `Multi-threaded (${Math.max(1, Math.min(os.cpus().length - 1, 8))} threads)`,
  });

  return providers;
}

