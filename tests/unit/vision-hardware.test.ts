import { describe, expect, it } from 'vitest';
import {
  classifyGpuType,
  discoverGpus,
  discoverLinuxGpus,
  discoverMacGpus,
  discoverMediaBackend,
  discoverWindowsGpus,
  normalizeVendor,
} from '../../src/main/vision/hardware';
import { discoverProviders } from '../../src/main/vision/providers';
import { qualifyHardwareProfile } from '../../src/main/vision/qualification';
import type { VisionHardwareDevice } from '../../src/shared/vision-types';

describe('Vision Hardware Discovery & Vendor Normalization', () => {
  it('correctly normalizes GPU vendor names', () => {
    expect(normalizeVendor('NVIDIA Corporation AD104 [GeForce RTX 4070]')).toBe('nvidia');
    expect(normalizeVendor('PCI\\VEN_10DE&DEV_2786')).toBe('nvidia');
    expect(normalizeVendor('Advanced Micro Devices, Inc. [AMD/ATI] Lucienne')).toBe('amd');
    expect(normalizeVendor('PCI\\VEN_1002&DEV_164C')).toBe('amd');
    expect(normalizeVendor('Intel Corporation Arc A770')).toBe('intel');
    expect(normalizeVendor('Intel(R) UHD Graphics 630')).toBe('intel');
    expect(normalizeVendor('Apple M3 Max')).toBe('apple');
    expect(normalizeVendor('Unknown Display Device')).toBe('unknown');
  });

  it('classifies GPU types (dedicated vs integrated vs virtual)', () => {
    expect(classifyGpuType('nvidia', 'GeForce RTX 4090')).toBe('dedicated');
    expect(classifyGpuType('amd', 'Radeon RX 7900 XTX')).toBe('dedicated');
    expect(classifyGpuType('amd', 'Lucienne (Radeon Vega Mobile)')).toBe('integrated');
    expect(classifyGpuType('intel', 'Iris Xe Graphics')).toBe('integrated');
    expect(classifyGpuType('apple', 'Apple M2 Pro')).toBe('integrated');
    expect(classifyGpuType('unknown', 'llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('virtual');
  });

  it('discovers Linux GPUs from lspci output', () => {
    const mockLspci = `
0000:00:00.0 Host bridge: Intel Corporation 12th Gen Core Processor Host Bridge/DRAM Registers (rev 02)
0000:01:00.0 VGA compatible controller [0300]: NVIDIA Corporation AD106 [GeForce RTX 4060 Ti 16GB] [10de:2805] (rev a1)
0000:01:00.1 Audio device: NVIDIA Corporation Device [10de:22bd] (rev a1)
    `.trim();

    const runner = (cmd: string) => (cmd.includes('lspci') ? mockLspci : '');
    const devices = discoverLinuxGpus(runner);

    expect(devices.length).toBe(1);
    expect(devices[0].vendor).toBe('nvidia');
    expect(devices[0].type).toBe('dedicated');
    expect(devices[0].deviceId).toBe('10de:2805');
  });

  it('discovers Windows GPUs from CIM instance JSON', () => {
    const mockWinGpu = JSON.stringify([
      {
        Name: 'NVIDIA GeForce RTX 3080',
        DriverVersion: '31.0.15.3623',
        AdapterRAM: 10737418240, // 10 GB
        PNPDeviceID: 'PCI\\VEN_10DE&DEV_2206&SUBSYS_146710DE&REV_A1',
      },
    ]);

    const runner = (cmd: string) => (cmd.includes('powershell') ? mockWinGpu : '');
    const devices = discoverWindowsGpus(runner);

    expect(devices.length).toBe(1);
    expect(devices[0].vendor).toBe('nvidia');
    expect(devices[0].vramMb).toBe(10240);
    expect(devices[0].type).toBe('dedicated');
  });

  it('discovers macOS GPUs from system_profiler JSON', () => {
    const mockMacGpu = JSON.stringify({
      SPDisplaysDataType: [
        {
          _name: 'Apple M2 Max',
          sppci_model: 'Apple M2 Max',
          spdisplays_vram: '32 GB',
        },
      ],
    });

    const runner = (cmd: string) => (cmd.includes('system_profiler') ? mockMacGpu : '');
    const devices = discoverMacGpus(runner);

    expect(devices.length).toBe(1);
    expect(devices[0].vendor).toBe('apple');
    expect(devices[0].vramMb).toBe(32768);
    expect(devices[0].type).toBe('integrated');
  });

  it('falls back to CPU virtual device when no GPU is detected', () => {
    const runner = () => '';
    const devices = discoverGpus('linux', runner, '/nonexistent_drm_dir');

    expect(devices.length).toBe(1);
    expect(devices[0].id).toBe('cpu-fallback');
    expect(devices[0].type).toBe('virtual');
  });

  it('parses media backend and hwaccels from ffmpeg', () => {
    const mockVersion = 'ffmpeg version 7.0.2-static Copyright (c) 2000-2024';
    const mockHwaccels = `
Hardware acceleration methods:
vdpau
vaapi
cuda
    `.trim();

    const runner = (cmd: string) => {
      if (cmd.includes('-version')) return mockVersion;
      if (cmd.includes('-hwaccels')) return mockHwaccels;
      return '';
    };

    const media = discoverMediaBackend(runner);
    expect(media.ffmpegVersion).toBe('7.0.2-static');
    expect(media.hwaccels).toContain('vaapi');
    expect(media.hwaccels).toContain('cuda');
  });
});

describe('Vision Providers & Capability Qualification', () => {
  it('identifies available inference providers for NVIDIA GPU', () => {
    const devices: VisionHardwareDevice[] = [
      {
        id: 'gpu-1',
        vendor: 'nvidia',
        model: 'GeForce RTX 4080',
        type: 'dedicated',
        vramMb: 16384,
        isPrimary: true,
      },
    ];

    const runner = (cmd: string) => {
      if (cmd.includes('nvidia-smi')) return 'NVIDIA-SMI 535.104.05   Driver Version: 535.104.05   CUDA Version: 12.2';
      return '';
    };

    const providers = discoverProviders(devices, 'linux', runner);
    const cuda = providers.find((p) => p.provider === 'cuda');
    const cpu = providers.find((p) => p.provider === 'cpu');
    const webgpu = providers.find((p) => p.provider === 'webgpu');

    expect(cuda?.available).toBe(true);
    expect(cuda?.version).toBe('535.104.05');
    expect(cpu?.available).toBe(true);
    expect(webgpu?.available).toBe(true);
  });

  it('assigns high_performance profile for dedicated 16GB GPU with CUDA', () => {
    const devices: VisionHardwareDevice[] = [
      {
        id: 'gpu-1',
        vendor: 'nvidia',
        model: 'RTX 4080',
        type: 'dedicated',
        vramMb: 16384,
        isPrimary: true,
      },
    ];
    const providers = [
      { provider: 'cuda' as const, available: true, validated: true },
      { provider: 'webgpu' as const, available: true, validated: true },
      { provider: 'cpu' as const, available: true, validated: true },
    ];

    const profile = qualifyHardwareProfile(devices, providers);
    expect(profile.profile).toBe('high_performance');
    expect(profile.maxTargetResolution).toBe('8k');
    expect(profile.liveEligible).toBe(true);
    expect(profile.offlineEligible).toBe(true);
    expect(profile.memoryBudgetMb).toBe(6144);
  });

  it('assigns balanced profile for AMD integrated GPU', () => {
    const devices: VisionHardwareDevice[] = [
      {
        id: 'gpu-1',
        vendor: 'amd',
        model: 'Lucienne Vega Graphics',
        type: 'integrated',
        vramMb: 2048,
        isPrimary: true,
      },
    ];
    const providers = [
      { provider: 'webgpu' as const, available: true, validated: true },
      { provider: 'cpu' as const, available: true, validated: true },
    ];

    const profile = qualifyHardwareProfile(devices, providers);
    expect(profile.profile).toBe('balanced');
    expect(profile.maxTargetResolution).toBe('1440p');
    expect(profile.liveEligible).toBe(true);
    expect(profile.offlineEligible).toBe(true);
  });

  it('assigns basic profile for virtual fallback adapter', () => {
    const devices: VisionHardwareDevice[] = [
      {
        id: 'cpu-fallback',
        vendor: 'unknown',
        model: 'Generic CPU',
        type: 'virtual',
        isPrimary: true,
      },
    ];
    const providers = [
      { provider: 'cpu' as const, available: true, validated: true },
    ];

    const profile = qualifyHardwareProfile(devices, providers);
    expect(profile.profile).toBe('basic');
    expect(profile.liveEligible).toBe(false);
    expect(profile.offlineEligible).toBe(true);
    expect(profile.maxTargetResolution).toBe('720p');
  });
});
