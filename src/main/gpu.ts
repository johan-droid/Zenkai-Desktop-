import { app } from "electron";
import { log } from "./logger";
import type { Settings } from "../shared/settings.schema";

export interface GpuConfigurationResult {
  platform: NodeJS.Platform;
  webGpuEnabled: boolean;
  hwDecodeEnabled: boolean;
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
    append("enable-features", "WebGPU");
    append("enable-gpu-rasterization");
    append("enable-zero-copy");

    if (!hwDecode) {
      append("disable-accelerated-video-decode");
    }
  } else if (isMac) {
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
    `GPU configuration initialized: platform=${platform}, hwDecode=${hwDecode}, switches=${switchesApplied
      .map((s) => (s.value ? `${s.switch}=${s.value}` : s.switch))
      .join(", ")}`,
  );

  return {
    platform,
    webGpuEnabled: true,
    hwDecodeEnabled: hwDecode,
    switchesApplied,
  };
}

