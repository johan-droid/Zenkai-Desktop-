import { CNNx2M, ModeA, ModeB, render, type Anime4KPipeline } from "anime4k-webgpu";

export const isWebGpuSupported =
  typeof navigator !== "undefined" && "gpu" in navigator;

export interface UpscaleController {
  stop: () => void;
  isActive: boolean;
}

/**
 * Starts real-time WebGPU-based Anime4K upscaling from <video> to <canvas>.
 * Output canvas is capped at 2x source resolution and DPR-adjusted.
 */
export async function startAnime4KUpscale(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  mode: "fast" | "modeA" | "modeB" = "modeA",
): Promise<UpscaleController> {
  if (!isWebGpuSupported) {
    throw new Error("WebGPU is not supported on this platform/device");
  }

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.max(
    1,
    Math.min(2, (window.innerWidth * dpr) / w, (window.innerHeight * dpr) / h),
  );

  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  await render({
    video,
    canvas,
    pipelineBuilder: (device, inputTexture) => {
      if (mode === "fast") {
        const pipeline = new CNNx2M({ device, inputTexture });
        return [pipeline];
      }

      const dims = {
        nativeDimensions: { width: w, height: h },
        targetDimensions: { width: canvas.width, height: canvas.height },
      };

      if (mode === "modeB") {
        const pipeline = new ModeB({ device, inputTexture, ...dims });
        return [pipeline as unknown as Anime4KPipeline];
      }

      const pipeline = new ModeA({ device, inputTexture, ...dims });
      return [pipeline as unknown as Anime4KPipeline];
    },
  });

  let active = true;
  return {
    stop: () => {
      active = false;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    get isActive() {
      return active;
    },
  };
}
