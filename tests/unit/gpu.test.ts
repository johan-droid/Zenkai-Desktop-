import { describe, it, expect, vi } from "vitest";
import { configureGpuSwitches, type CommandLineInterface } from "../../src/main/gpu";

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

