import { app } from "electron";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "./logger";
import type { Settings } from "../shared/settings.schema";
import type {
  UnifiedGpuDiagnostics,
  GpuDiagnosticState,
  GpuDevice,
  GpuVendor,
  GpuType,
} from "../shared/gpu-types";

export interface CommandRunner {
  (cmd: string): string;
}

const defaultRunner: CommandRunner = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 3000 });
  } catch {
    return "";
  }
};

/**
 * Normalizes vendor strings into standard GpuVendor enum.
 */
export function normalizeVendor(raw: string): GpuVendor {
  const s = raw.toLowerCase();
  if (
    s.includes("nvidia") ||
    s.includes("0x10de") ||
    s.includes("10de") ||
    s.includes("geforce") ||
    s.includes("quadro")
  ) {
    return "nvidia";
  }
  if (
    s.includes("amd") ||
    s.includes("advanced micro devices") ||
    /\bati\b/i.test(raw) ||
    s.includes("[amd/ati]") ||
    s.includes("0x1002") ||
    s.includes("ven_1002") ||
    s.includes("radeon")
  ) {
    return "amd";
  }
  if (
    s.includes("intel") ||
    s.includes("0x8086") ||
    s.includes("8086") ||
    s.includes("arc") ||
    s.includes("iris") ||
    s.includes("uhd")
  ) {
    return "intel";
  }
  if (s.includes("apple")) {
    return "apple";
  }
  return "unknown";
}

/**
 * Classifies whether a GPU is integrated or dedicated based on model keywords or vendor indicators.
 */
export function classifyGpuType(vendor: GpuVendor, model: string): GpuType {
  const m = model.toLowerCase();
  if (m.includes("virtual") || m.includes("llvmpipe") || m.includes("vmware") || m.includes("qemu")) {
    return "virtual";
  }
  if (vendor === "apple") {
    return "integrated"; // Apple Silicon unified memory SoC
  }
  if (
    m.includes("integrated") ||
    m.includes("uhd graphics") ||
    m.includes("iris") ||
    m.includes("vega") ||
    m.includes("lucienne") ||
    m.includes("renoir") ||
    m.includes("cezanne") ||
    m.includes("barcelo") ||
    m.includes("radeon graphics") ||
    m.includes("intel hd")
  ) {
    return "integrated";
  }
  if (
    vendor === "nvidia" ||
    m.includes("rtx") ||
    m.includes("gtx") ||
    m.includes("geforce") ||
    m.includes("quadro") ||
    m.includes("radeon rx") ||
    m.includes("radeon pro") ||
    m.includes("arc a") ||
    m.includes("arc pro") ||
    m.includes("alchemist") ||
    m.includes("battlemage") ||
    (vendor === "intel" && (m.includes("arc") || m.includes("dg1") || m.includes("dg2")))
  ) {
    return "dedicated";
  }
  return "dedicated";
}

/**
 * Parses Linux sysfs / DRM paths or lspci to find GPU devices.
 */
export function discoverLinuxGpus(
  runner: CommandRunner = defaultRunner,
  drmDir = "/sys/class/drm",
): GpuDevice[] {
  const devices: GpuDevice[] = [];

  // Try lspci first
  const lspciOut = runner("lspci -nn -D");
  if (lspciOut) {
    const lines = lspciOut.split("\n");
    for (const line of lines) {
      if (/vga compatible controller|3d controller|display controller/i.test(line)) {
        const vendor = normalizeVendor(line);
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
        const vendorPath = path.join(drmDir, card, "device", "vendor");
        const devicePath = path.join(drmDir, card, "device", "device");
        if (fs.existsSync(vendorPath)) {
          const vHex = fs.readFileSync(vendorPath, "utf8").trim();
          const dHex = fs.existsSync(devicePath) ? fs.readFileSync(devicePath, "utf8").trim() : "";
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
 * Discovers Windows GPUs using PowerShell / CIM instance.
 */
export function discoverWindowsGpus(runner: CommandRunner = defaultRunner): GpuDevice[] {
  const devices: GpuDevice[] = [];
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
export function discoverMacGpus(runner: CommandRunner = defaultRunner): GpuDevice[] {
  const devices: GpuDevice[] = [];
  const cmd = "system_profiler SPDisplaysDataType -json";
  const raw = runner(cmd);
  if (!raw) return devices;

  try {
    const parsed = JSON.parse(raw);
    const displays = parsed.SPDisplaysDataType || [];
    for (const item of displays) {
      const model = item.sppci_model || item._name || "Apple Silicon GPU";
      const vendor = normalizeVendor(model);
      const vramStr = item.spdisplays_vram || item.sppci_vram || "";
      let vramMb: number | undefined;
      const numMatch = vramStr.match(/(\d+)\s*(MB|GB)/i);
      if (numMatch) {
        const val = parseInt(numMatch[1], 10);
        vramMb = numMatch[2].toUpperCase() === "GB" ? val * 1024 : val;
      }

      const type = classifyGpuType(vendor, model);

      devices.push({
        id: `mac-${devices.length}`,
        vendor,
        model,
        type,
        vramMb,
        isPrimary: devices.length === 0,
      });
    }
  } catch {}

  return devices;
}

/**
 * Cross-platform hardware GPU discovery with primary device resolution based on preference.
 */
export function discoverGpus(
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = defaultRunner,
  drmDir = "/sys/class/drm",
  preference: "auto" | "high-performance" | "power-saving" = "auto",
): GpuDevice[] {
  let list: GpuDevice[] = [];
  if (platform === "linux") {
    list = discoverLinuxGpus(runner, drmDir);
  } else if (platform === "win32") {
    list = discoverWindowsGpus(runner);
  } else if (platform === "darwin") {
    list = discoverMacGpus(runner);
  }

  // Fallback: If no dedicated/integrated GPU detected or in container, return fallback
  if (list.length === 0) {
    list.push({
      id: "cpu-fallback",
      vendor: "unknown",
      model: `${os.cpus()[0]?.model || "Standard CPU"} (Software Render)`,
      type: "virtual",
      isPrimary: true,
    });
  } else if (list.length > 1) {
    let primaryIndex = 0;
    if (preference === "high-performance") {
      const idx = list.findIndex((d) => d.type === "dedicated");
      if (idx !== -1) primaryIndex = idx;
    } else if (preference === "power-saving") {
      const idx = list.findIndex((d) => d.type === "integrated");
      if (idx !== -1) primaryIndex = idx;
    }
    list.forEach((dev, idx) => {
      dev.isPrimary = idx === primaryIndex;
    });
  }

  return list;
}

export interface GpuConfigurationResult {
  platform: NodeJS.Platform;
  webGpuEnabled: boolean;
  hwDecodeEnabled: boolean;
  gpuPreference: "auto" | "high-performance" | "power-saving";
  switchesApplied: Array<{ switch: string; value?: string }>;
}

export interface CommandLineInterface {
  appendSwitch(sw: string, value?: string): void;
}

/**
 * Configures platform-specific Chromium GPU switches and hardware video decoding
 * before Electron app.whenReady() fires.
 */
export function configureGpuSwitches(
  settings: Partial<Settings> = {},
  commandLine: CommandLineInterface = app.commandLine,
  platform: NodeJS.Platform = process.platform,
): GpuConfigurationResult {
  const switchesApplied: Array<{ switch: string; value?: string }> = [];

  const append = (sw: string, val?: string) => {
    if (val !== undefined) {
      commandLine.appendSwitch(sw, val);
      switchesApplied.push({ switch: sw, value: val });
    } else {
      commandLine.appendSwitch(sw);
      switchesApplied.push({ switch: sw });
    }
  };

  const isLinux = platform === "linux";
  const isWindows = platform === "win32";
  const isMac = platform === "darwin";

  const hwDecode = settings.hwDecode !== false;
  const pref = settings.gpuPreference ?? "auto";

  // Multi-GPU power/performance routing
  if (pref === "high-performance") {
    append("force_high_performance_gpu");
  } else if (pref === "power-saving") {
    append("force_low_power_gpu");
  }

  if (isLinux) {
    // Linux-specific Chromium flags for physical AMD/Intel/NVIDIA GPU acceleration and WebGPU
    append("enable-unsafe-webgpu");
    append("enable-webgpu-developer-features");
    append("ignore-gpu-blocklist");
    append("enable-gpu-rasterization");
    append("enable-zero-copy");

    if (hwDecode) {
      // VA-API hardware video decode & encode acceleration via Mesa drivers
      append("enable-features", "WebGPU,VaapiVideoDecoder,VaapiVideoEncoder");
    } else {
      // User explicitly opted out: fallback to software decoding cleanly
      append("enable-features", "WebGPU");
      append("disable-accelerated-video-decode");
    }
  } else if (isWindows) {
    // Windows Direct3D 12 for WebGPU via Dawn and Media Foundation / D3D11 for video decode
    append("enable-features", "WebGPU");
    append("enable-gpu-rasterization");
    append("enable-zero-copy");

    if (!hwDecode) {
      append("disable-accelerated-video-decode");
    }
  } else if (isMac) {
    // macOS Metal for WebGPU and VideoToolbox for video decode
    append("enable-features", "WebGPU");
    append("enable-gpu-rasterization");
    append("enable-zero-copy");

    if (!hwDecode) {
      append("disable-accelerated-video-decode");
    }
  } else {
    // Other UNIX-like platforms
    append("enable-features", "WebGPU");
    if (!hwDecode) {
      append("disable-accelerated-video-decode");
    }
  }

  log.main.info(
    `GPU configuration initialized: platform=${platform}, hwDecode=${hwDecode}, pref=${pref}, switches=${switchesApplied
      .map((s) => (s.value ? `${s.switch}=${s.value}` : s.switch))
      .join(", ")}`,
  );

  return {
    platform,
    webGpuEnabled: true,
    hwDecodeEnabled: hwDecode,
    gpuPreference: pref,
    switchesApplied,
  };
}

/**
 * Returns unified GPU diagnostics incorporating physical hardware discovery,
 * Chromium GPU feature status, active decoder pipeline, and fail-safe state.
 */
export function getGpuDiagnostics(
  settings: Partial<Settings> = {},
  platform: NodeJS.Platform = process.platform,
): UnifiedGpuDiagnostics {
  const isLinux = platform === "linux";
  const isWindows = platform === "win32";
  const isMac = platform === "darwin";

  const preference = settings.gpuPreference ?? "auto";
  const hwDecode = settings.hwDecode !== false;

  const devices = discoverGpus(platform, undefined, undefined, preference);

  // Determine primary device according to preference
  let primaryDevice = devices.length > 0 ? devices[0] : null;
  if (devices.length > 1) {
    if (preference === "high-performance") {
      const dedicated = devices.find((d) => d.type === "dedicated");
      if (dedicated) primaryDevice = dedicated;
    } else if (preference === "power-saving") {
      const integrated = devices.find((d) => d.type === "integrated");
      if (integrated) primaryDevice = integrated;
    }
  }

  // Detect graphics API backend
  let backend: UnifiedGpuDiagnostics["backend"] = "unknown";
  if (isLinux) {
    backend = "vulkan";
  } else if (isWindows) {
    backend = "d3d12";
  } else if (isMac) {
    backend = "metal";
  } else {
    backend = "opengl";
  }

  let gpuFeatureStatus: Record<string, string> | undefined;
  try {
    if (typeof app !== "undefined" && typeof app.getGPUFeatureStatus === "function") {
      gpuFeatureStatus = app.getGPUFeatureStatus() as unknown as Record<string, string>;
    }
  } catch {}

  const hasHardwareGpu = devices.some((d) => d.type !== "virtual");

  let webGpuStatus: GpuDiagnosticState = "UNKNOWN";
  if (!hasHardwareGpu) {
    webGpuStatus = "FALLBACK";
  } else if (gpuFeatureStatus) {
    const rawWebGpu = gpuFeatureStatus["webgpu"] || "";
    if (rawWebGpu === "enabled") {
      webGpuStatus = "AVAILABLE";
    } else if (rawWebGpu.includes("disabled") || rawWebGpu.includes("blocklist")) {
      webGpuStatus = "UNSUPPORTED";
    } else {
      webGpuStatus = "AVAILABLE";
    }
  } else {
    webGpuStatus = "AVAILABLE";
  }

  let videoDecodeStatus: GpuDiagnosticState = "UNKNOWN";
  let activeDecoder = "FFmpegVideoDecoder";

  if (!hwDecode) {
    videoDecodeStatus = "FALLBACK";
    activeDecoder = "FFmpegVideoDecoder";
  } else if (hasHardwareGpu) {
    videoDecodeStatus = "AVAILABLE";
    if (isLinux) {
      activeDecoder = "VaapiVideoDecoder";
    } else if (isWindows) {
      activeDecoder = "D3D11VideoDecoder";
    } else if (isMac) {
      activeDecoder = "VTVideoDecoder";
    } else {
      activeDecoder = "FFmpegVideoDecoder";
    }
  } else {
    videoDecodeStatus = "UNSUPPORTED";
    activeDecoder = "FFmpegVideoDecoder";
  }

  const details: string[] = [
    `Platform: ${platform}`,
    `Backend: ${backend}`,
    `GPU Preference: ${preference}`,
    `Hardware Decoding Configured: ${hwDecode}`,
    `Primary GPU: ${primaryDevice ? `${primaryDevice.model} (${primaryDevice.type})` : "None"}`,
    `Decoder Target: ${activeDecoder}`,
  ];

  return {
    timestamp: Date.now(),
    platform,
    gpuPreference: preference,
    devices,
    primaryDevice,
    webGpuStatus,
    videoDecodeStatus,
    activeDecoder,
    backend,
    gpuFeatureStatus,
    details,
  };
}
