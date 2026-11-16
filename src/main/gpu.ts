import { app } from "electron";
import { log } from "./logger";
import type { Settings } from "../shared/settings.schema";
import type { UnifiedGpuDiagnostics, GpuDiagnosticState } from "../shared/gpu-types";
import { discoverGpus } from "./vision/hardware";

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
