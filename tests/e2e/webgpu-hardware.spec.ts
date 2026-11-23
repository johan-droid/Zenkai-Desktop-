import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

test.describe("Hardware & WebGPU Physical Verification", () => {
  test("Electron main process configures switches and renderer accesses WebGPU", async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;

    const app = await electron.launch({
      args: [path.join(__dirname, "../../out/main/index.js")],
      env: launchEnv,
    });

    try {
      const window = await app.firstWindow();
      expect(window).toBeDefined();
      await window.waitForLoadState("domcontentloaded");

      // 1. Verify Main Process GPU Diagnostics via Preload IPC
      const diagnostics = await window.evaluate(async () => {
        return await (window as any).zenkai?.gpu?.getDiagnostics?.();
      });

      console.log("\n==========================================");
      console.log("  Main Process GPU IPC Diagnostics");
      console.log("==========================================");
      console.log(JSON.stringify(diagnostics, null, 2));

      expect(diagnostics).toBeDefined();
      expect(diagnostics.platform).toBe(process.platform);
      expect(diagnostics.webGpuStatus).toBe("AVAILABLE");

      // 2. Verify Renderer WebGPU & Anime4K Shaders
      const rendererGpuResult = await window.evaluate(async () => {
        const win = window as any;
        const out: any = {
          hasNavigator: typeof navigator !== "undefined",
          isSecureContext: typeof win !== "undefined" && !!win.isSecureContext,
          currentURL: typeof win !== "undefined" && win.location ? win.location.href : "",
          hasGpuInNavigator: typeof navigator !== "undefined" && "gpu" in navigator,
          adapterAcquired: false,
          adapterInfo: null,
          deviceAcquired: false,
          wgslCompiled: false,
          renderExecuted: false,
          anime4kImported: false,
          anime4kPresetCreated: false,
          error: null,
        };

        if (!out.hasGpuInNavigator) {
          out.error = "navigator.gpu is missing from renderer";
          return out;
        }

        try {
          const adapter = await navigator.gpu.requestAdapter({
            powerPreference: "high-performance",
          });
          if (!adapter) {
            out.error = "navigator.gpu.requestAdapter() returned null";
            return out;
          }

          out.adapterAcquired = true;
          const info =
            (adapter as any).info ||
            (await (adapter as any).requestAdapterInfo?.()) ||
            {};
          out.adapterInfo = {
            vendor: info.vendor || "",
            architecture: info.architecture || "",
            device: info.device || "",
            description: info.description || "",
            isFallbackAdapter: (adapter as any).isFallbackAdapter || false,
          };

          const device = await adapter.requestDevice();
          if (!device) {
            out.error = "adapter.requestDevice() returned null";
            return out;
          }
          out.deviceAcquired = true;

          // Compile WGSL shader
          const shaderCode = `
            struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
            @vertex fn vs(@builtin(vertex_index) i: u32) -> V {
              var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
              var o: V;
              o.p = vec4f(pos[i], 0, 1);
              o.uv = vec2f((pos[i].x + 1) * 0.5, (1 - pos[i].y) * 0.5);
              return o;
            }
            @fragment fn fs(v: V) -> @location(0) vec4f {
              return vec4f(0.86, 0.08, 0.24, 1.0); // Zenkai Crimson
            }
          `;
          const shaderModule = device.createShaderModule({ code: shaderCode });
          const format = navigator.gpu.getPreferredCanvasFormat();
          const pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: shaderModule, entryPoint: "vs" },
            fragment: {
              module: shaderModule,
              entryPoint: "fs",
              targets: [{ format }],
            },
            primitive: { topology: "triangle-list" },
          });
          out.wgslCompiled = !!pipeline;

          // Offscreen texture render
          const texture = device.createTexture({
            size: [128, 128],
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
          });

          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: texture.createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.draw(3);
          pass.end();

          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          out.renderExecuted = true;

          // Test bundled anime4k-webgpu module via bundled chunk
          try {
            // @ts-ignore
            const anime4kModule = await import("./assets/lib-DOg8BndC.js");
            const anime4k = (anime4kModule.default && anime4kModule.default.ModeA) ? anime4kModule.default : anime4kModule;
            out.anime4kImported = !!(anime4k.ModeA && anime4k.CNNx2M);

            const inputTex = device.createTexture({
              size: [640, 360],
              format: "rgba16float",
              usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.RENDER_ATTACHMENT,
            });

            // Instantiate CNNx2M (fast mode) and ModeA
            const presetFast = new anime4k.CNNx2M({
              device,
              inputTexture: inputTex,
            });
            const presetA = new anime4k.ModeA({
              device,
              inputTexture: inputTex,
              nativeDimensions: { width: 640, height: 360 },
              targetDimensions: { width: 1280, height: 720 },
            });

            out.anime4kPresetCreated = !!presetFast && !!presetA;

            // Execute pass
            const animEncoder = device.createCommandEncoder();
            presetFast.pass(animEncoder);
            device.queue.submit([animEncoder.finish()]);
            await device.queue.onSubmittedWorkDone();
            out.anime4kExecutionSuccess = true;
          } catch (a4kErr: any) {
            out.anime4kError = a4kErr?.message || String(a4kErr);
          }
        } catch (err: any) {
          out.error = err?.message || String(err);
        }

        return out;
      });

      console.log("\n==========================================");
      console.log("  Renderer WebGPU & Anime4K Execution");
      console.log("==========================================");
      console.log(JSON.stringify(rendererGpuResult, null, 2));
      console.log("==========================================\n");

      expect(rendererGpuResult.hasGpuInNavigator).toBe(true);
      expect(rendererGpuResult.adapterAcquired).toBe(true);
      expect(rendererGpuResult.deviceAcquired).toBe(true);
      expect(rendererGpuResult.wgslCompiled).toBe(true);
      expect(rendererGpuResult.renderExecuted).toBe(true);
      expect(rendererGpuResult.anime4kImported).toBe(true);
      expect(rendererGpuResult.anime4kPresetCreated).toBe(true);
      expect(rendererGpuResult.anime4kExecutionSuccess).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("Zenkai Vision Studio is completely removed and GPU API is authoritative", async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;

    const app = await electron.launch({
      args: [path.join(__dirname, "../../out/main/index.js")],
      env: launchEnv,
    });

    try {
      const window = await app.firstWindow();
      expect(window).toBeDefined();
      await window.waitForLoadState("domcontentloaded");

      // Verify Zenkai Vision Studio IPC & namespace are completely removed
      const checkResult = await window.evaluate(async () => {
        const win = window as any;
        return {
          hasZenkai: typeof win.zenkai !== "undefined",
          hasVisionNamespace: typeof win.zenkai?.vision !== "undefined",
          hasGpuNamespace: typeof win.zenkai?.gpu !== "undefined",
          settings: await win.zenkai?.settings?.get?.(),
          gpuDiagnostics: await win.zenkai?.gpu?.getDiagnostics?.(),
        };
      });

      console.log("\n==========================================");
      console.log("  Decommissioned Studio Namespace Verification");
      console.log("==========================================");
      console.log(JSON.stringify(checkResult, null, 2));
      console.log("==========================================\n");

      expect(checkResult.hasZenkai).toBe(true);
      expect(checkResult.hasVisionNamespace).toBe(false);
      expect(checkResult.hasGpuNamespace).toBe(true);
      expect(checkResult.gpuDiagnostics).toBeDefined();
      expect(checkResult.gpuDiagnostics.devices.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
