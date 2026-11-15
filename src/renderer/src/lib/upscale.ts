/**
 * Zenkai Vision Live Video Enhancement Bridge
 * Backward-compatible bridge to vision-live.ts
 */
export {
  gpuSupported,
  startVisionLive as startUpscale,
  type VisionLivePreset as Anime4KMode,
  type VisionLiveOptions as UpscaleOptions,
  type VisionLiveMetrics,
} from './vision-live';
