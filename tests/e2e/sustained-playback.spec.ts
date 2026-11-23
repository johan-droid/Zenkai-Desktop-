import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

function readHostThermal(): { cpuTempC: number | null } {
  try {
    const tzDirs = fs.readdirSync("/sys/class/thermal").filter((d) => d.startsWith("thermal_zone"));
    for (const dir of tzDirs) {
      const typePath = path.join("/sys/class/thermal", dir, "type");
      if (fs.existsSync(typePath)) {
        const type = fs.readFileSync(typePath, "utf-8").trim().toLowerCase();
        if (type.includes("x86_pkg_temp") || type.includes("k10temp") || type.includes("cpu") || type.includes("acpitz")) {
          const tempPath = path.join("/sys/class/thermal", dir, "temp");
          if (fs.existsSync(tempPath)) {
            const raw = parseInt(fs.readFileSync(tempPath, "utf-8").trim(), 10);
            return { cpuTempC: Math.round((raw / 1000) * 10) / 10 };
          }
        }
      }
    }
  } catch { }
  return { cpuTempC: null };
}

test.describe("Phase 6: Sustained Playback & Thermal Load Verification", () => {
  test.setTimeout(120000);

  test("Run sustained video playback with live WebGPU enhancement under real hardware load", async () => {
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
      const initialThermal = readHostThermal();

      const sustainedResult = await window.evaluate(async ({ src }) => {
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

          let metricHistory: any[] = [];
          let droppedTotal = 0;
          let bypassOccurred = false;
          let degradeOccurred = false;

          const startVision = (window as any).__startVisionLive;
          const handle = await startVision(video, canvas, {
            mode: "fast",
            onMetrics: (m: any) => {
              metricHistory.push({
                fps: m.currentFps,
                renderTimeMs: m.renderTimeMs,
                droppedFrames: m.droppedFrames,
                watchdogStatus: m.watchdogStatus,
              });
              droppedTotal = m.droppedFrames;
            },
            onBypass: () => {
              bypassOccurred = true;
            },
            onDegrade: () => {
              degradeOccurred = true;
            },
          });

          // Run sustained playback for 30 seconds
          const durationMs = 30000;
          const startT = performance.now();

          await new Promise((r) => setTimeout(r, durationMs));

          const actualDurationSec = Math.round((performance.now() - startT) / 1000);
          const finalPlaybackTime = video.currentTime;
          const isPlayingAtEnd = !video.paused && !video.ended;

          handle.stop();
          video.pause();
          video.remove();
          canvas.remove();

          const nonZeroMetrics = metricHistory.filter((m) => m.renderTimeMs > 0);
          const avgLatency = nonZeroMetrics.length > 0
            ? Math.round((nonZeroMetrics.reduce((acc, m) => acc + m.renderTimeMs, 0) / nonZeroMetrics.length) * 10) / 10
            : 0;

          const nonZeroFps = metricHistory.filter((m) => m.fps > 0);
          const avgFps = nonZeroFps.length > 0
            ? Math.round((nonZeroFps.reduce((acc, m) => acc + m.fps, 0) / nonZeroFps.length) * 10) / 10
            : 0;

          resolve({
            durationSec: actualDurationSec,
            finalPlaybackTime: Math.round(finalPlaybackTime * 10) / 10,
            isPlayingAtEnd,
            avgFps,
            avgLatencyMs: avgLatency,
            totalDroppedFrames: droppedTotal,
            bypassOccurred,
            degradeOccurred,
            sampleCount: metricHistory.length,
          });
        });
      }, { src: videoSrc });

      const finalThermal = readHostThermal();

      console.log("\n==========================================================================================");
      console.log("  PHASE 6: Sustained Real Hardware Playback & Thermal Report");
      console.log("==========================================================================================");
      console.log(`Duration: ${sustainedResult.durationSec} seconds continuous playback`);
      console.log(`Video Final Playback Time: ${sustainedResult.finalPlaybackTime}s (active playback: ${sustainedResult.isPlayingAtEnd})`);
      console.log(`Average Sustained WebGPU FPS: ${sustainedResult.avgFps} FPS`);
      console.log(`Average Frame Render Latency: ${sustainedResult.avgLatencyMs} ms`);
      console.log(`Total Dropped WebGPU Frames: ${sustainedResult.totalDroppedFrames}`);
      console.log(`Unexpected Bypass Occurred: ${sustainedResult.bypassOccurred}`);
      console.log(`Initial CPU Package Thermal: ${initialThermal.cpuTempC ?? "N/A"} °C`);
      console.log(`Final CPU Package Thermal: ${finalThermal.cpuTempC ?? "N/A"} °C`);
      console.log("==========================================================================================\n");

      expect(sustainedResult.isPlayingAtEnd).toBe(true);
      expect(sustainedResult.durationSec).toBeGreaterThanOrEqual(25);
      expect(sustainedResult.sampleCount).toBeGreaterThan(20);
      expect(sustainedResult.avgFps).toBeGreaterThan(15);
      expect(sustainedResult.bypassOccurred).toBe(false);
    } finally {
      await app.close();
    }
  });
});
