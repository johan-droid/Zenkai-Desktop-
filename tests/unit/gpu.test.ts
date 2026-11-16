import { describe, it, expect, vi } from "vitest";
import {
  configureGpuSwitches,
  getGpuDiagnostics,
  type CommandLineInterface,
} from "../../src/main/gpu";

describe("GPU configuration switches (configureGpuSwitches)", () => {
  it("configures Linux with hardware decode enabled (default)", () => {
    const switches: Record<string, string | undefined> = {};
    const commandLine: CommandLineInterface = {
      appendSwitch: vi.fn((sw: string, val?: string) => {
        switches[sw] = val;
      }),
    };

    const res = configureGpuSwitches({ hwDecode: true }, commandLine, "linux");

    expect(res.platform).toBe("linux");
    expect(res.webGpuEnabled).toBe(true);
    expect(res.hwDecodeEnabled).toBe(true);
    expect(res.gpuPreference).toBe("auto");
    expect(switches["enable-unsafe-webgpu"]).toBeUndefined();
    expect(switches["enable-webgpu-developer-features"]).toBeUndefined();
    expect(switches["ignore-gpu-blocklist"]).toBeUndefined();
    expect(switches["enable-gpu-rasterization"]).toBeUndefined();
    expect(switches["enable-zero-copy"]).toBeUndefined();
    expect(switches["enable-features"]).toBe("WebGPU,VaapiVideoDecoder,VaapiVideoEncoder");
    expect(switches["disable-accelerated-video-decode"]).toBeUndefined();
  });

  it("configures Linux with hardware decode disabled by user", () => {
    const switches: Record<string, string | undefined> = {};
    const commandLine: CommandLineInterface = {
      appendSwitch: vi.fn((sw: string, val?: string) => {
        switches[sw] = val;
      }),
    };

    const res = configureGpuSwitches({ hwDecode: false }, commandLine, "linux");

    expect(res.platform).toBe("linux");
    expect(res.webGpuEnabled).toBe(true);
    expect(res.hwDecodeEnabled).toBe(false);
    expect(switches["enable-features"]).toBe("WebGPU");
    expect("disable-accelerated-video-decode" in switches).toBe(true);
  });

  it("applies power/performance GPU switches", () => {
    const switchesHigh: Record<string, string | undefined> = {};
    const clHigh: CommandLineInterface = {
      appendSwitch: vi.fn((sw: string, val?: string) => {
        switchesHigh[sw] = val;
      }),
    };
    const resHigh = configureGpuSwitches({ gpuPreference: "high-performance" }, clHigh, "win32");
    expect(resHigh.gpuPreference).toBe("high-performance");
    expect("force_high_performance_gpu" in switchesHigh).toBe(true);

    const switchesLow: Record<string, string | undefined> = {};
    const clLow: CommandLineInterface = {
      appendSwitch: vi.fn((sw: string, val?: string) => {
        switchesLow[sw] = val;
      }),
    };
    const resLow = configureGpuSwitches({ gpuPreference: "power-saving" }, clLow, "linux");
    expect(resLow.gpuPreference).toBe("power-saving");
    expect("force_low_power_gpu" in switchesLow).toBe(true);
  });

  it("configures Windows correctly", () => {
    const switches: Record<string, string | undefined> = {};
    const commandLine: CommandLineInterface = {
      appendSwitch: vi.fn((sw: string, val?: string) => {
        switches[sw] = val;
      }),
    };

    const res = configureGpuSwitches({ hwDecode: true }, commandLine, "win32");

    expect(res.platform).toBe("win32");
    expect(switches["enable-features"]).toBe("WebGPU");
    expect(switches["enable-gpu-rasterization"]).toBeUndefined();
    expect(switches["disable-accelerated-video-decode"]).toBeUndefined();
  });

  it("configures macOS correctly with hwDecode disabled", () => {
    const switches: Record<string, string | undefined> = {};
    const commandLine: CommandLineInterface = {
      appendSwitch: vi.fn((sw: string, val?: string) => {
        switches[sw] = val;
      }),
    };

    const res = configureGpuSwitches({ hwDecode: false }, commandLine, "darwin");

    expect(res.platform).toBe("darwin");
    expect(switches["enable-features"]).toBe("WebGPU");
    expect("disable-accelerated-video-decode" in switches).toBe(true);
  });
});

describe("Unified GPU Diagnostics (getGpuDiagnostics)", () => {
  it("returns structured diagnostics across platforms", () => {
    const linuxDiag = getGpuDiagnostics({ hwDecode: true, gpuPreference: "auto" }, "linux");
    expect(linuxDiag.platform).toBe("linux");
    expect(linuxDiag.backend).toBe("vulkan");
    if (linuxDiag.devices.every((device) => device.type === "virtual")) {
      expect(linuxDiag.webGpuStatus).toBe("FALLBACK");
    } else {
      expect(["AVAILABLE", "UNSUPPORTED"]).toContain(linuxDiag.webGpuStatus);
    }
    expect(["VaapiVideoDecoder", "FFmpegVideoDecoder"]).toContain(linuxDiag.activeDecoder);

    const winDiag = getGpuDiagnostics({ hwDecode: true, gpuPreference: "high-performance" }, "win32");
    expect(winDiag.platform).toBe("win32");
    expect(winDiag.backend).toBe("d3d12");
    expect(winDiag.gpuPreference).toBe("high-performance");

    const macDiag = getGpuDiagnostics({ hwDecode: false, gpuPreference: "power-saving" }, "darwin");
    expect(macDiag.platform).toBe("darwin");
    expect(macDiag.backend).toBe("metal");
    expect(macDiag.videoDecodeStatus).toBe("FALLBACK");
    expect(macDiag.activeDecoder).toBe("FFmpegVideoDecoder");
  });
});
