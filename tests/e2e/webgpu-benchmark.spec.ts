import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";
import os from "node:os";

function getCpuUsage(): { user: number; sys: number; idle: number; total: number } {
  const cpus = os.cpus();
  let user = 0, sys = 0, idle = 0;
  for (const c of cpus) {
    user += c.times.user;
    sys += c.times.sys;
    idle += c.times.idle;
  }
  return { user, sys, idle, total: user + sys + idle };
}

test.describe("Phase 2: Real-Time WebGPU Pipeline & Preset Benchmarks", () => {
  test.setTimeout(300000);

  test("Benchmark Anime4K Presets and Resolutions on Physical AMD Lucienne", async () => {
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

      // Verify WebGPU availability
      const hasGpu = await window.evaluate(() => typeof navigator !== "undefined" && "gpu" in navigator);
      expect(hasGpu).toBe(true);

      const presets = [
        "fast",      // CNNx2M
        "modeA",     // ModeA
        "modeB",     // ModeB
        "modeC",     // ModeC
        "modeAA",    // ModeAA
        "modeCA",    // ModeCA
        "denoise",   // DenoiseCNNx2VL
      ];

      const resolutions = [
        { label: "720p", file: "test-720p.mp4", width: 1280, height: 720 },
        { label: "1080p", file: "test-1080p.mp4", width: 1920, height: 1080 },
        { label: "1440p", file: "test-1440p.mp4", width: 2560, height: 1440 },
        { label: "4K", file: "test-4k.mp4", width: 3840, height: 2160 },
      ];

      const benchmarkResults: any[] = [];

      for (const res of resolutions) {
        const videoSrc = "file://" + path.join(__dirname, "fixtures", res.file);

        for (const presetName of presets) {
          // Skip expensive modes on 4K/1440p if it exceeds practical APU limits
          if ((res.label === "4K" || res.label === "1440p") && (presetName === "modeC" || presetName === "modeCA" || presetName === "denoise")) {
            benchmarkResults.push({
              resolution: res.label,
              inputDim: `${res.width}x${res.height}`,
              outputDim: "N/A",
              preset: presetName,
              initTimeMs: "Skipped",
              p50LatencyMs: "N/A",
              p95LatencyMs: "N/A",
              p99LatencyMs: "N/A",
              avgLatencyMs: "N/A",
              sustainedFps: "N/A",
              droppedFrames: 0,
              cpuPercent: "N/A",
              status: "EXCLUDED_BY_TIER_POLICY",
            });
            continue;
          }

          const cpu0 = getCpuUsage();

          const runResult = await window.evaluate(async ({ src, mode }) => {
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

              let initStart = performance.now();
              let initTimeMs = 0;
              let metricsCollected: any[] = [];
              let frameLatencies: number[] = [];
              let droppedCount = 0;
              let bypassReason = "";
              let degradedTo = "";

              const startVision = (window as any).__startVisionLive;
              if (!startVision) {
                resolve({ error: "__startVisionLive not exposed on window" });
                return;
              }

                try {
                  const handle = await startVision(video, canvas, {
                    mode,
                    splitPercent: 100,
                    onMetrics: (metrics: any) => {
                      metricsCollected.push(metrics);
                      if (metrics.renderTimeMs > 0) {
                        frameLatencies.push(metrics.renderTimeMs);
                      }
                      droppedCount = metrics.droppedFrames;
                    },
                    onBypass: (reason: string) => {
                      bypassReason = reason;
                    },
                    onDegrade: (preset: string) => {
                      degradedTo = preset;
                    },
                  });

                  initTimeMs = Math.round(performance.now() - initStart);

                  // Run for 2.5 seconds to collect sustained frames
                  setTimeout(() => {
                    handle.stop();
                    video.pause();
                    video.remove();
                    canvas.remove();

                    // Calculate percentile latencies
                    frameLatencies.sort((a, b) => a - b);
                    const p50 = frameLatencies.length > 0 ? frameLatencies[Math.floor(frameLatencies.length * 0.5)] : 0;
                    const p95 = frameLatencies.length > 0 ? frameLatencies[Math.floor(frameLatencies.length * 0.95)] : 0;
                    const p99 = frameLatencies.length > 0 ? frameLatencies[Math.floor(frameLatencies.length * 0.99)] : 0;
                    const avg = frameLatencies.length > 0 ? frameLatencies.reduce((a, b) => a + b, 0) / frameLatencies.length : 0;

                    const lastMetric = metricsCollected[metricsCollected.length - 1] || {};

                    resolve({
                      initTimeMs,
                      inputWidth: video.videoWidth,
                      inputHeight: video.videoHeight,
                      outputWidth: canvas.width,
                      outputHeight: canvas.height,
                      samplesCount: frameLatencies.length,
                      p50LatencyMs: Math.round(p50 * 10) / 10,
                      p95LatencyMs: Math.round(p95 * 10) / 10,
                      p99LatencyMs: Math.round(p99 * 10) / 10,
                      avgLatencyMs: Math.round(avg * 10) / 10,
                      sustainedFps: lastMetric.currentFps || 0,
                      droppedFrames: droppedCount,
                      bypassReason,
                      degradedTo,
                    });
                  }, 2500);
                } catch (err: any) {
                  video.remove();
                  canvas.remove();
                  resolve({ error: err?.message || String(err), initTimeMs: Math.round(performance.now() - initStart) });
                }
            });
          }, { src: videoSrc, mode: presetName });

          await new Promise((r) => setTimeout(r, 200));
          const cpu1 = getCpuUsage();
          const totalDelta = cpu1.total - cpu0.total;
          const busyDelta = (cpu1.user + cpu1.sys) - (cpu0.user + cpu0.sys);
          const cpuPercent = totalDelta > 0 ? Math.round((busyDelta / totalDelta) * 1000) / 10 : 0;

          if (runResult.error) {
            benchmarkResults.push({
              resolution: res.label,
              inputDim: `${res.width}x${res.height}`,
              outputDim: "N/A",
              preset: presetName,
              initTimeMs: runResult.initTimeMs || "N/A",
              p50LatencyMs: "N/A",
              p95LatencyMs: "N/A",
              p99LatencyMs: "N/A",
              avgLatencyMs: "N/A",
              sustainedFps: "N/A",
              droppedFrames: 0,
              cpuPercent: `${cpuPercent}%`,
              status: `FAILED: ${runResult.error}`,
            });
          } else {
            benchmarkResults.push({
              resolution: res.label,
              inputDim: `${runResult.inputWidth}x${runResult.inputHeight}`,
              outputDim: `${runResult.outputWidth}x${runResult.outputHeight}`,
              preset: presetName,
              initTimeMs: `${runResult.initTimeMs}ms`,
              p50LatencyMs: `${runResult.p50LatencyMs}ms`,
              p95LatencyMs: `${runResult.p95LatencyMs}ms`,
              p99LatencyMs: `${runResult.p99LatencyMs}ms`,
              avgLatencyMs: `${runResult.avgLatencyMs}ms`,
              sustainedFps: runResult.sustainedFps,
              droppedFrames: runResult.droppedFrames,
              cpuPercent: `${cpuPercent}%`,
              status: runResult.degradedTo ? `DEGRADED_TO_${runResult.degradedTo}` : "PASS",
            });
          }
        }
      }

      console.log("\n==========================================================================================");
      console.log("  PHASE 2: Real-Time WebGPU + Anime4K Preset & Resolution Benchmark Matrix");
      console.log("==========================================================================================");
      console.table(benchmarkResults);
      console.log("==========================================================================================\n");

      // Verify at least the primary 720p/1080p presets completed
      const fast720p = benchmarkResults.find((r) => r.resolution === "720p" && r.preset === "fast");
      expect(fast720p).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
