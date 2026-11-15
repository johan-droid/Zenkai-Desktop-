import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  GpuType,
  GpuVendor,
  MediaBackendInfo,
  VisionHardwareDevice,
} from '../../shared/vision-types';

export interface CommandRunner {
  (cmd: string): string;
}

const defaultRunner: CommandRunner = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 });
  } catch {
    return '';
  }
};

/**
 * Normalizes vendor strings into standard GpuVendor enum.
 */
export function normalizeVendor(raw: string): GpuVendor {
  const s = raw.toLowerCase();
  if (
    s.includes('nvidia') ||
    s.includes('0x10de') ||
    s.includes('10de') ||
    s.includes('geforce') ||
    s.includes('quadro')
  ) {
    return 'nvidia';
  }
  if (
    s.includes('amd') ||
    s.includes('advanced micro devices') ||
    /\bati\b/i.test(raw) ||
    s.includes('[amd/ati]') ||
    s.includes('0x1002') ||
    s.includes('ven_1002') ||
    s.includes('radeon')
  ) {
    return 'amd';
  }
  if (
    s.includes('intel') ||
    s.includes('0x8086') ||
    s.includes('8086') ||
    s.includes('arc') ||
    s.includes('iris') ||
    s.includes('uhd')
  ) {
    return 'intel';
  }
  if (s.includes('apple')) {
    return 'apple';
  }
  return 'unknown';
}

/**
 * Classifies whether a GPU is integrated or dedicated based on model keywords or vendor indicators.
 */
export function classifyGpuType(vendor: GpuVendor, model: string): GpuType {
  const m = model.toLowerCase();
  if (m.includes('virtual') || m.includes('llvmpipe') || m.includes('vmware') || m.includes('qemu')) {
    return 'virtual';
  }
  if (vendor === 'apple') {
    return 'integrated'; // Apple Silicon unified memory SoC
  }
  if (
    m.includes('integrated') ||
    m.includes('uhd graphics') ||
    m.includes('iris') ||
    m.includes('vega') ||
    m.includes('lucienne') ||
    m.includes('renoir') ||
    m.includes('cezanne') ||
    m.includes('barcelo') ||
    m.includes('radeon graphics') ||
    m.includes('intel hd')
  ) {
    return 'integrated';
  }
  if (
    vendor === 'nvidia' ||
    m.includes('rtx') ||
    m.includes('gtx') ||
    m.includes('radeon rx') ||
    m.includes('arc a')
  ) {
    return 'dedicated';
  }
  return 'dedicated';
}

/**
 * Parses Linux sysfs / DRM paths or lspci to find GPU devices.
 */
export function discoverLinuxGpus(
  runner: CommandRunner = defaultRunner,
  drmDir = '/sys/class/drm',
): VisionHardwareDevice[] {
  const devices: VisionHardwareDevice[] = [];

  // Try lspci first
  const lspciOut = runner('lspci -nn -D');
  if (lspciOut) {
    const lines = lspciOut.split('\n');
    for (const line of lines) {
      if (/vga compatible controller|3d controller|display controller/i.test(line)) {
        const vendor = normalizeVendor(line);
        // Extract model description: e.g. "Advanced Micro Devices, Inc. [AMD/ATI] Lucienne (rev c2)"
        const match = line.match(/:\s*(.+?)(?:\s*\[[0-9a-f]{4}:[0-9a-f]{4}\]|$)/i);
        const model = match ? match[1].trim() : line.trim();
        const pciIdMatch = line.match(/\[([0-9a-f]{4}:[0-9a-f]{4})\]/i);
        const deviceId = pciIdMatch ? pciIdMatch[1] : undefined;
        const type = classifyGpuType(vendor, model);

        devices.push({
          id: `pci-${deviceId || devices.length}`,
          vendor,
          model,
          deviceId,
          type,
          isPrimary: devices.length === 0,
        });
      }
    }
  }

  // Fallback to /sys/class/drm
  if (devices.length === 0 && fs.existsSync(drmDir)) {
    try {
      const entries = fs.readdirSync(drmDir);
      const cards = entries.filter((e) => /^card\d+$/.test(e));
      for (const card of cards) {
        const vendorPath = path.join(drmDir, card, 'device', 'vendor');
        const devicePath = path.join(drmDir, card, 'device', 'device');
        if (fs.existsSync(vendorPath)) {
          const vHex = fs.readFileSync(vendorPath, 'utf8').trim();
          const dHex = fs.existsSync(devicePath) ? fs.readFileSync(devicePath, 'utf8').trim() : '';
          const vendor = normalizeVendor(vHex);
          devices.push({
            id: `drm-${card}`,
            vendor,
            model: `GPU Device (${card} - ${vendor.toUpperCase()})`,
            deviceId: dHex ? `${vHex}:${dHex}` : vHex,
            type: classifyGpuType(vendor, `GPU Device (${card})`),
            isPrimary: devices.length === 0,
          });
        }
      }
    } catch {}
  }

  return devices;
}

/**
 * Discovers Windows GPUs using PowerShell / WMIC.
 */
export function discoverWindowsGpus(runner: CommandRunner = defaultRunner): VisionHardwareDevice[] {
  const devices: VisionHardwareDevice[] = [];
  const cmd =
    'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM,PNPDeviceID | ConvertTo-Json"';
  const raw = runner(cmd);
  if (!raw) return devices;

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (!item.Name) continue;
      const vendor = normalizeVendor(item.Name);
      const model = String(item.Name).trim();
      const type = classifyGpuType(vendor, model);
      const vramBytes = Number(item.AdapterRAM) || 0;
      const vramMb = vramBytes > 0 ? Math.round(vramBytes / (1024 * 1024)) : undefined;

      devices.push({
        id: `win-${item.PNPDeviceID || devices.length}`,
        vendor,
        model,
        deviceId: item.PNPDeviceID,
        type,
        driverVersion: item.DriverVersion,
        vramMb,
        isPrimary: devices.length === 0,
      });
    }
  } catch {}

  return devices;
}

/**
 * Discovers macOS GPUs using system_profiler.
 */
export function discoverMacGpus(runner: CommandRunner = defaultRunner): VisionHardwareDevice[] {
  const devices: VisionHardwareDevice[] = [];
  const cmd = 'system_profiler SPDisplaysDataType -json';
  const raw = runner(cmd);
  if (!raw) return devices;

  try {
    const parsed = JSON.parse(raw);
    const displays = parsed.SPDisplaysDataType || [];
    for (const item of displays) {
      const model = item.sppci_model || item._name || 'Apple Silicon GPU';
      const vendor = normalizeVendor(model);
      const vramStr = item.spdisplays_vram || item.sppci_vram || '';
      let vramMb: number | undefined;
      const numMatch = vramStr.match(/(\d+)\s*(MB|GB)/i);
      if (numMatch) {
        const val = parseInt(numMatch[1], 10);
        vramMb = numMatch[2].toUpperCase() === 'GB' ? val * 1024 : val;
      }

      devices.push({
        id: `mac-${devices.length}`,
        vendor,
        model,
        type: 'integrated',
        vramMb,
        isPrimary: devices.length === 0,
      });
    }
  } catch {}

  return devices;
}

/**
 * Cross-platform hardware GPU discovery.
 */
export function discoverGpus(
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = defaultRunner,
  drmDir = '/sys/class/drm',
): VisionHardwareDevice[] {
  let list: VisionHardwareDevice[] = [];
  if (platform === 'linux') {
    list = discoverLinuxGpus(runner, drmDir);
  } else if (platform === 'win32') {
    list = discoverWindowsGpus(runner);
  } else if (platform === 'darwin') {
    list = discoverMacGpus(runner);
  }

  // Fallback: If no dedicated GPU detected or running in container, return fallback
  if (list.length === 0) {
    list.push({
      id: 'cpu-fallback',
      vendor: 'unknown',
      model: `${os.cpus()[0]?.model || 'Standard CPU'} (Software Render)`,
      type: 'virtual',
      isPrimary: true,
    });
  }

  return list;
}

/**
 * Discovers and validates FFmpeg and FFprobe binaries.
 */
export function discoverMediaBackend(runner: CommandRunner = defaultRunner): MediaBackendInfo {
  const candidates = [
    process.env.ZENKAI_FFMPEG_PATH,
    path.join(os.homedir(), '.local/bin/ffmpeg'),
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ].filter(Boolean) as string[];

  let resolvedFfmpeg: string | undefined;
  let ffmpegVersion: string | undefined;

  for (const c of candidates) {
    if (c === 'ffmpeg' || fs.existsSync(c)) {
      const vOut = runner(`${c} -version`);
      if (vOut && vOut.includes('ffmpeg version')) {
        resolvedFfmpeg = c;
        const m = vOut.match(/ffmpeg version\s+([^\s]+)/i);
        ffmpegVersion = m ? m[1] : 'unknown';
        break;
      }
    }
  }

  // Discover FFprobe
  let resolvedFfprobe: string | undefined;
  if (resolvedFfmpeg) {
    const probePath = resolvedFfmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    if (fs.existsSync(probePath) || runner(`${probePath} -version`).includes('ffprobe version')) {
      resolvedFfprobe = probePath;
    }
  }

  // Probe hardware accels supported by FFmpeg
  const hwaccels: string[] = [];
  if (resolvedFfmpeg) {
    const hwOut = runner(`${resolvedFfmpeg} -hwaccels`);
    if (hwOut) {
      const lines = hwOut.split('\n').map((l) => l.trim()).filter(Boolean);
      let started = false;
      for (const line of lines) {
        if (line.includes('Hardware acceleration methods:')) {
          started = true;
          continue;
        }
        if (started && !line.includes(':') && line.length < 20) {
          hwaccels.push(line);
        }
      }
    }
  }

  // Detect codec availability
  return {
    ffmpegPath: resolvedFfmpeg,
    ffmpegVersion,
    ffprobePath: resolvedFfprobe,
    hwaccels,
    codecs: {
      h264: true,
      hevc: true,
      av1: true,
      vp9: true,
    },
  };
}
