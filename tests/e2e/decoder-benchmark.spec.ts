import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

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

test.describe("Phase 1: Real Hardware Video Decoding Verification", () => {
  const resolutions = [
    { label: "720p", file: "test-720p.mp4", width: 1280, height: 720 },
    { label: "1080p", file: "test-1080p.mp4", width: 1920, height: 1080 },
    { label: "1440p", file: "test-1440p.mp4", width: 2560, height: 1440 },
    { label: "4K", file: "test-4k.mp4", width: 3840, height: 2160 },
  ];

  test("Matrix: VA-API Hardware Decoding vs Software Fallback", async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;

    const app = await electron.launch({
      args: [path.join(__dirname, "../../out/main/index.js")],
      env: launchEnv,
    });

    const matrixResults: any[] = [];

    try {
      const window = await app.firstWindow();
      expect(window).toBeDefined();
      await window.waitForLoadState("domcontentloaded");

      const client = await window.context().newCDPSession(window);
      await client.send("Media.enable");

      const playerMap: Record<string, Record<string, any>> = {};

      client.on("Media.playerPropertiesChanged", (data: any) => {
        if (!playerMap[data.playerId]) playerMap[data.playerId] = {};
        for (const prop of data.properties) {
          playerMap[data.playerId][prop.name] = prop.value;
        }
      });

      for (const res of resolutions) {
        const videoUrl = "file://" + path.join(__dirname, "fixtures", res.file);
        const cpu0 = getCpuUsage();

        const result = await window.evaluate(async (src) => {
          return new Promise<any>((resolve) => {
            const v = document.createElement("video");
            v.src = src;
            v.muted = true;
            v.playsInline = true;
            v.autoplay = true;
            v.style.position = "fixed";
            v.style.top = "0";
            v.style.left = "0";
            v.style.width = "320px";
            v.style.height = "180px";
            v.style.opacity = "0.001";
            v.style.pointerEvents = "none";
            v.style.zIndex = "999999";
            document.body.appendChild(v);

            let frameCount = 0;
            const onFrame = () => {
              frameCount++;
              if (v.requestVideoFrameCallback && !v.paused && !v.ended) {
                v.requestVideoFrameCallback(onFrame);
              }
            };

            v.onplaying = () => {
              if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame);
            };

            const t0 = performance.now();
            setTimeout(() => {
              const quality = (v as any).getVideoPlaybackQuality?.() || {};
              resolve({
                videoWidth: v.videoWidth,
                videoHeight: v.videoHeight,
                duration: v.duration,
                currentTime: v.currentTime,
                paused: v.paused,
                framesRendered: quality.totalVideoFrames || frameCount,
                droppedFrames: quality.droppedVideoFrames || 0,
                corruptedFrames: quality.corruptedVideoFrames || 0,
                durationMs: performance.now() - t0,
              });
              v.pause();
              v.remove();
            }, 2000);
          });
        }, videoUrl);

        await new Promise((r) => setTimeout(r, 300));
        const cpu1 = getCpuUsage();
        const totalDelta = cpu1.total - cpu0.total;
        const busyDelta = (cpu1.user + cpu1.sys) - (cpu0.user + cpu0.sys);
        const cpuPercent = totalDelta > 0 ? Math.round((busyDelta / totalDelta) * 1000) / 10 : 0;

        // Find last reported CDP player
        const playerIds = Object.keys(playerMap);
        const lastPlayer = playerIds.length > 0 ? playerMap[playerIds[playerIds.length - 1]] : {};

        matrixResults.push({
          resolution: res.label,
          targetWidth: res.width,
          targetHeight: res.height,
          decoder: lastPlayer.kVideoDecoderName || "Unknown",
          isPlatformDecoder: lastPlayer.kIsPlatformVideoDecoder === "true",
          framesRendered: result.framesRendered,
          droppedFrames: result.droppedFrames,
          corruptedFrames: result.corruptedFrames,
          playbackFps: Math.round((result.framesRendered / (result.durationMs / 1000)) * 10) / 10,
          estimatedCpuPercent: cpuPercent,
        });
      }

      console.log("\n=======================================================");
      console.log("  PHASE 1: VA-API Hardware Video Decoding Matrix");
      console.log("=======================================================");
      console.table(matrixResults);
      console.log("=======================================================\n");

      // Verify all tests used VaapiVideoDecoder with near-zero dropped frames (<= 2 startup sync frames allowed)
      for (const r of matrixResults) {
        expect(r.decoder).toBe("VaapiVideoDecoder");
        expect(r.isPlatformDecoder).toBe(true);
        expect(r.droppedFrames).toBeLessThanOrEqual(2);
      }
    } finally {
      await app.close();
    }
  });

  test("Verify graceful fallback to FFmpegVideoDecoder when hwDecode is disabled", async () => {
    // Launch Electron with hwDecode explicitly disabled
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;

    // Use commandLine switches directly to simulate disable-accelerated-video-decode
    const app = await electron.launch({
      args: [
        "--disable-accelerated-video-decode",
        path.join(__dirname, "../../out/main/index.js"),
      ],
      env: launchEnv,
    });

    try {
      const window = await app.firstWindow();
      expect(window).toBeDefined();
      await window.waitForLoadState("domcontentloaded");

      const client = await window.context().newCDPSession(window);
      await client.send("Media.enable");

      const playerMap: Record<string, Record<string, any>> = {};
      client.on("Media.playerPropertiesChanged", (data: any) => {
        if (!playerMap[data.playerId]) playerMap[data.playerId] = {};
        for (const prop of data.properties) {
          playerMap[data.playerId][prop.name] = prop.value;
        }
      });

      const videoUrl = "file://" + path.join(__dirname, "fixtures/test-1080p.mp4");

      const result = await window.evaluate(async (src) => {
        return new Promise<any>((resolve) => {
          const v = document.createElement("video");
          v.src = src;
          v.muted = true;
          v.playsInline = true;
          v.autoplay = true;
          v.style.position = "fixed";
          v.style.top = "0";
          v.style.left = "0";
          v.style.width = "320px";
          v.style.height = "180px";
          v.style.opacity = "0.001";
          v.style.pointerEvents = "none";
          v.style.zIndex = "999999";
          document.body.appendChild(v);

          setTimeout(() => {
            const quality = (v as any).getVideoPlaybackQuality?.() || {};
            resolve({
              videoWidth: v.videoWidth,
              videoHeight: v.videoHeight,
              currentTime: v.currentTime,
              framesRendered: quality.totalVideoFrames || 0,
              droppedFrames: quality.droppedVideoFrames || 0,
            });
            v.pause();
            v.remove();
          }, 1500);
        });
      }, videoUrl);

      await new Promise((r) => setTimeout(r, 400));
      const playerIds = Object.keys(playerMap);
      const lastPlayer = playerIds.length > 0 ? playerMap[playerIds[playerIds.length - 1]] : {};

      console.log("\n=======================================================");
      console.log("  PHASE 1: Fallback Software Decoder Verification");
      console.log("=======================================================");
      console.log(`Decoder Selected: ${lastPlayer.kVideoDecoderName}`);
      console.log(`Is Platform Decoder: ${lastPlayer.kIsPlatformVideoDecoder}`);
      console.log(`Rendered Frames: ${result.framesRendered}`);
      console.log(`Dropped Frames: ${result.droppedFrames}`);
      console.log("=======================================================\n");

      expect(lastPlayer.kVideoDecoderName).toBe("FFmpegVideoDecoder");
      expect(lastPlayer.kIsPlatformVideoDecoder).toBe("false");
      expect(result.currentTime).toBeGreaterThan(0.3);
    } finally {
      await app.close();
    }
  });
});
