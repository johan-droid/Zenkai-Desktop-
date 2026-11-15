export type VisionJobStatus = 'queued' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface VisionAudioStreamInfo {
  index: number;
  codec: string;
  channels: number;
  sampleRate?: number;
  language?: string;
  title?: string;
}

export interface VisionSubtitleStreamInfo {
  index: number;
  codec: string;
  language?: string;
  title?: string;
}

export interface VisionVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  videoCodec: string;
  audioStreams: VisionAudioStreamInfo[];
  subtitleStreams: VisionSubtitleStreamInfo[];
  bitrateKbps?: number;
  pixelFormat?: string;
}

export interface VisionJobOptions {
  inputPath: string;
  outputPath: string;
  modelId: string;
  targetResolution: '1080p' | '1440p' | '4k' | '8k';
  tileSize?: number;
  tileOverlap?: number;
  encoder?: 'auto' | 'nvenc' | 'vaapi' | 'amf' | 'videotoolbox' | 'libx264' | 'libx265';
  crf?: number;
  audioMode?: 'passthrough' | 'aac' | 'none';
  subtitlesMode?: 'passthrough' | 'none';
  preserveMetadata?: boolean;
}

export interface VisionJobProgress {
  jobId: string;
  status: VisionJobStatus;
  currentFrame: number;
  totalFrames: number;
  percent: number;
  currentFps: number;
  etaSeconds: number;
  elapsedSeconds: number;
  memoryMb?: number;
  stage: 'probing' | 'extracting' | 'enhancing' | 'encoding' | 'muxing' | 'completed' | 'failed';
  error?: string;
}

export interface VisionJob {
  id: string;
  status: VisionJobStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  options: VisionJobOptions;
  metadata?: VisionVideoMetadata;
  progress: VisionJobProgress;
  outputFileSize?: number;
}
