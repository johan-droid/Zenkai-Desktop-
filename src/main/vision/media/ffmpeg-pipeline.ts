import { spawn, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type {
  VisionVideoMetadata,
  VisionAudioStreamInfo,
  VisionSubtitleStreamInfo,
  VisionJobOptions,
} from '../../../shared/vision-jobs';
import { getCompleteHardwareProfile } from '../qualification';

const execFileAsync = promisify(execFile);

export function resolveFfmpegBinaries(): { ffmpeg: string; ffprobe: string } {
  const profile = getCompleteHardwareProfile();
  const ffmpeg = profile.mediaBackend.ffmpegPath || 'ffmpeg';
  const ffprobe = profile.mediaBackend.ffprobePath || 'ffprobe';
  return { ffmpeg, ffprobe };
}

export function parseFraction(rateStr?: string): number {
  if (!rateStr) return 24;
  if (!rateStr.includes('/')) {
    const val = parseFloat(rateStr);
    return isNaN(val) || val <= 0 ? 24 : Math.round(val * 100) / 100;
  }
  const parts = rateStr.split('/');
  const num = parseFloat(parts[0]);
  const den = parseFloat(parts[1]);
  if (isNaN(num) || isNaN(den) || den === 0) return 24;
  return Math.round((num / den) * 100) / 100;
}

export async function probeVideo(filePath: string): Promise<VisionVideoMetadata> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input video file not found: ${filePath}`);
  }

  const { ffprobe, ffmpeg } = resolveFfmpegBinaries();

  try {
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-print_format', 'json',
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const format = data.format || {};

    const videoStream = streams.find((s: Record<string, unknown>) => s.codec_type === 'video');
    if (!videoStream) {
      throw new Error('No video stream found in the specified media file');
    }

    const width = Number(videoStream.width) || 1280;
    const height = Number(videoStream.height) || 720;
    const fps = parseFraction(videoStream.r_frame_rate || videoStream.avg_frame_rate);
    const durationSeconds = Number(videoStream.duration || format.duration) || 0;

    let frameCount = Number(videoStream.nb_frames) || 0;
    if (frameCount <= 0 && durationSeconds > 0 && fps > 0) {
      frameCount = Math.round(durationSeconds * fps);
    }
    if (frameCount <= 0) {
      frameCount = 1;
    }

    const audioStreams: VisionAudioStreamInfo[] = streams
      .filter((s: Record<string, unknown>) => s.codec_type === 'audio')
      .map((s: Record<string, unknown>, idx: number) => ({
        index: Number(s.index ?? idx),
        codec: String(s.codec_name || 'unknown'),
        channels: Number(s.channels || 2),
        sampleRate: Number(s.sample_rate) || undefined,
        language: s.tags && typeof s.tags === 'object' ? (s.tags as Record<string, string>).language : undefined,
        title: s.tags && typeof s.tags === 'object' ? (s.tags as Record<string, string>).title : undefined,
      }));

    const subtitleStreams: VisionSubtitleStreamInfo[] = streams
      .filter((s: Record<string, unknown>) => s.codec_type === 'subtitle')
      .map((s: Record<string, unknown>, idx: number) => ({
        index: Number(s.index ?? idx),
        codec: String(s.codec_name || 'unknown'),
        language: s.tags && typeof s.tags === 'object' ? (s.tags as Record<string, string>).language : undefined,
        title: s.tags && typeof s.tags === 'object' ? (s.tags as Record<string, string>).title : undefined,
      }));

    return {
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      width,
      height,
      fps,
      frameCount,
      videoCodec: String(videoStream.codec_name || 'unknown'),
      audioStreams,
      subtitleStreams,
      bitrateKbps: format.bit_rate ? Math.round(Number(format.bit_rate) / 1000) : undefined,
      pixelFormat: String(videoStream.pix_fmt || 'yuv420p'),
    };
  } catch (err: unknown) {
    // Fallback: parse ffmpeg -i stderr if ffprobe failed or returned invalid json
    try {
      const { stderr } = await execFileAsync(ffmpeg, ['-i', filePath], { maxBuffer: 10 * 1024 * 1024 }).catch((e) => e);
      const str = String(stderr || '');
      const dimMatch = str.match(/Video:.*?([0-9]{3,5})x([0-9]{3,5})/);
      const fpsMatch = str.match(/([0-9.]+)\s+fps/);
      const durMatch = str.match(/Duration:\s+([0-9]{2}):([0-9]{2}):([0-9]{2}\.[0-9]+)/);

      const width = dimMatch ? parseInt(dimMatch[1], 10) : 1280;
      const height = dimMatch ? parseInt(dimMatch[2], 10) : 720;
      const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 24;

      let durationSeconds = 0;
      if (durMatch) {
        durationSeconds =
          parseInt(durMatch[1], 10) * 3600 +
          parseInt(durMatch[2], 10) * 60 +
          parseFloat(durMatch[3]);
      }

      return {
        durationSeconds: Math.round(durationSeconds * 100) / 100,
        width,
        height,
        fps,
        frameCount: Math.max(1, Math.round(durationSeconds * fps)),
        videoCodec: 'unknown',
        audioStreams: [],
        subtitleStreams: [],
      };
    } catch {
      throw new Error(`Failed to probe video file: ${(err as Error)?.message || String(err)}`);
    }
  }
}

export function computeTargetDimensions(
  inWidth: number,
  inHeight: number,
  target: '1080p' | '1440p' | '4k' | '8k',
  scale: 2 | 4,
): { width: number; height: number } {
  // If native scale fits within or matches target bounds, scale directly
  let targetHeight = inHeight * scale;
  let targetWidth = inWidth * scale;

  const maxHeights: Record<string, number> = {
    '1080p': 1080,
    '1440p': 1440,
    '4k': 2160,
    '8k': 4320,
  };

  const limitH = maxHeights[target] || 2160;
  if (targetHeight > limitH) {
    const ratio = inWidth / inHeight;
    targetHeight = limitH;
    targetWidth = Math.round(targetHeight * ratio);
  }

  // Enforce even dimensions (required for H.264/HEVC)
  targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;
  targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight + 1;

  return { width: targetWidth, height: targetHeight };
}

export function selectEncoder(
  userEncoder: VisionJobOptions['encoder'],
  targetResolution: string,
): { encoder: string; extraArgs: string[] } {
  const profile = getCompleteHardwareProfile();
  const accels = profile.mediaBackend.hwaccels;

  const is8K = targetResolution === '8k';

  if (userEncoder === 'nvenc' || (userEncoder === 'auto' && accels.includes('cuda'))) {
    // NVENC HEVC is much better suited for 4K / 8K
    if (is8K || targetResolution === '4k') {
      return { encoder: 'hevc_nvenc', extraArgs: ['-preset', 'p5', '-cq', '19'] };
    }
    return { encoder: 'h264_nvenc', extraArgs: ['-preset', 'p5', '-cq', '19'] };
  }

  if (userEncoder === 'vaapi' || (userEncoder === 'auto' && accels.includes('vaapi'))) {
    if (is8K || targetResolution === '4k') {
      return { encoder: 'hevc_vaapi', extraArgs: ['-qp', '20'] };
    }
    return { encoder: 'h264_vaapi', extraArgs: ['-qp', '20'] };
  }

  if (userEncoder === 'videotoolbox' || (userEncoder === 'auto' && accels.includes('videotoolbox'))) {
    if (is8K || targetResolution === '4k') {
      return { encoder: 'hevc_videotoolbox', extraArgs: ['-q:v', '70'] };
    }
    return { encoder: 'h264_videotoolbox', extraArgs: ['-q:v', '70'] };
  }

  // High-fidelity CPU encoding fallback
  if (is8K || targetResolution === '4k') {
    return { encoder: 'libx265', extraArgs: ['-crf', '18', '-preset', 'medium'] };
  }
  return { encoder: 'libx264', extraArgs: ['-crf', '18', '-preset', 'medium'] };
}

export function getAtomicTempPath(finalPath: string): string {
  return `${finalPath}.part.mp4`;
}

export function finalizeOutputFile(tempPath: string, finalPath: string): void {
  if (fs.existsSync(tempPath)) {
    // Ensure destination directory exists
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Remove finalPath if it exists (atomic replace)
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
    fs.renameSync(tempPath, finalPath);
  }
}

export function cleanupTempFile(tempPath: string): void {
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
