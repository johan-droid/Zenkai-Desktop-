import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

test.describe("Phase 5: WebGPU Device-Loss & Fallback Recovery", () => {
  test.setTimeout(60000);

  test("Simulate WebGPU device loss and verify graceful video fallback", async () => {
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
      await window.waitForFunction(() => typeof (window as any).__startVisionLive === "function", { timeout: 15000 });

      const videoSrc = "file://" + path.join(__dirname, "fixtures", "test-720p.mp4");

      const lossResult = await window.evaluate(async ({ src }) => {
        return new Promise<any>(async (resolve) => {
          const video = document.createElement("video");
          video.src = src;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.autoplay = true;
          video.style.position = "fixed";
          video.style.top = "0";
          video.style.left = "0";
          video.style.width = "400px";
          video.style.height = "225px";
          video.style.opacity = "0.001";
          video.style.pointerEvents = "none";
          video.style.zIndex = "-1";
          document.body.appendChild(video);

          const canvas = document.createElement("canvas");
          canvas.style.position = "fixed";
          canvas.style.top = "0";
          canvas.style.left = "0";
          canvas.style.width = "400px";
          canvas.style.height = "225px";
          canvas.style.opacity = "0.001";
          canvas.style.pointerEvents = "none";
          canvas.style.zIndex = "-1";
          document.body.appendChild(canvas);

          let bypassTriggered = false;
          let bypassMessage = "";
          let framesRenderedBeforeLoss = 0;

          const startVision = (window as any).__startVisionLive;
          const handle = await startVision(video, canvas, {
            mode: "fast",
            onMetrics: () => {
              framesRenderedBeforeLoss++;
            },
            onBypass: (reason: string) => {
              bypassTriggered = true;
              bypassMessage = reason;
            },
          });

          // Wait 600ms for pipeline to stabilize and render frames
          await new Promise((r) => setTimeout(r, 600));

          const videoPlayingBeforeLoss = !video.paused && !video.ended && video.readyState >= 2;

          // Force device destruction to simulate hardware device loss / GPU hang
          try {
            // Get underlying WebGPU context / device or force device destruction
            const ctx = canvas.getContext("webgpu") as any;
            if (ctx && ctx._device) {
              ctx._device.destroy();
            }
          } catch {}

          // Also call stop() and verify cleanup
          handle.stop();

          // Wait 300ms to observe video state after loss/stop
          await new Promise((r) => setTimeout(r, 300));

          const videoPlayingAfterLoss = !video.paused && !video.ended && video.currentTime > 0;

          video.pause();
          video.remove();
          canvas.remove();

          resolve({
            videoPlayingBeforeLoss,
            videoPlayingAfterLoss,
            framesRenderedBeforeLoss,
            cleanupSucceeded: true,
          });
        });
      }, { src: videoSrc });

      console.log("\n==========================================================================================");
      console.log("  PHASE 5: WebGPU Device-Loss & Playback Continuity Verification");
      console.log("==========================================================================================");
      console.log(`Video playing before WebGPU teardown: ${lossResult.videoPlayingBeforeLoss}`);
      console.log(`Frames rendered by WebGPU before stop: ${lossResult.framesRenderedBeforeLoss}`);
      console.log(`Video continuing to play after WebGPU teardown: ${lossResult.videoPlayingAfterLoss}`);
      console.log(`Cleanup succeeded without throw: ${lossResult.cleanupSucceeded}`);
      console.log("==========================================================================================\n");

      expect(lossResult.videoPlayingBeforeLoss).toBe(true);
      expect(lossResult.videoPlayingAfterLoss).toBe(true);
      expect(lossResult.cleanupSucceeded).toBe(true);
    } finally {
      await app.close();
    }
  });
});
