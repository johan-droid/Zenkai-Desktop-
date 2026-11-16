export type Settings = import("./settings.schema").Settings;

export type DownloadItem = {
  id: string;
  name: string;
  status: "queued" | "active" | "paused" | "done" | "error";
  bytes: number;
  total: number;
  anilistId?: number;
  episode?: number;
  audio?: "sub" | "dub";
  server?: string;
  segmentsTotal?: number;
  segmentsDone?: number;
  path?: string;
  error?: string;
};

export type UpdateDiagnostics = {
  currentVersion: string;
  channel: "stable" | "beta" | "internal";
  lastCheckTime?: string;
  updateAvailable: boolean;
  availableVersion?: string;
  downloadState: "idle" | "downloading" | "downloaded" | "failed";
  downloadedVersion?: string;
  downloadedFile?: string;
  verificationState: "none" | "pending" | "verified" | "failed";
  computedHash?: string;
  expectedHash?: string;
  installationState: "idle" | "ready" | "in_progress" | "failed";
  lastFailureReason?: string;
  lastSuccessfulUpdate?: string;
};

export type IpcContract = {
  "settings:get": () => Promise<Settings>;
  "settings:set": (patch: Partial<Settings>) => Promise<Settings>;
  "downloads:start": (p: {
    id: string;
    anilistId: number;
    episode: number;
    audio: "sub" | "dub";
    server: string;
    withSubtitles: boolean;
    name?: string;
  }) => Promise<void>;
  "downloads:resolve": (p: {
    anilistId: number;
    episode: number;
    audio: "sub" | "dub";
    server: string;
  }) => Promise<{
    playable: boolean;
    streamUrl?: string;
    rawUrl?: string;
    subtitles?: import("./api-types").SubtitleTrack[];
    audioTracks?: import("./api-types").AudioTrack[];
    intro?: { start: number; end: number } | null;
    outro?: { start: number; end: number } | null;
    referer?: string;
    reason?: string;
  }>;
  "downloads:list": () => Promise<DownloadItem[]>;
  "downloads:remove": (id: string) => Promise<void>;
  "rpc:set": (p: {
    title: string;
    details?: string;
    startedAt?: number;
  }) => Promise<void>;
  "rpc:clear": () => Promise<void>;
  "app:version": () => Promise<string>;
  "app:checkUpdate": () => Promise<{
    updateAvailable: boolean;
    version?: string;
    channel?: string;
    releaseDate?: string;
    notes?: string;
    mandatory?: boolean;
    assetUrl?: string;
    reason?: string;
  }>;
  "app:startUpdateDownload": () => Promise<{ success: boolean; message?: string }>;
  "app:installUpdate": () => Promise<void>;
  "app:updateDiagnostics": () => Promise<UpdateDiagnostics>;
  "app:openFile": (path: string) => Promise<void>;
  "window:loadWebPortal": () => void;
  "updater:check": () => Promise<{
    updateAvailable: boolean;
    version?: string;
    channel?: string;
    releaseDate?: string;
    notes?: string;
    mandatory?: boolean;
    assetUrl?: string;
    reason?: string;
  }>;
  "updater:start-download": () => Promise<{ success: boolean; message?: string }>;
  "updater:install": () => Promise<void>;
  "updater:diagnostics": () => Promise<UpdateDiagnostics>;
  "vision:getHardwareProfile": () => Promise<import("./vision-types").VisionHardwareProfile>;
  "vision:runDiagnostics": () => Promise<import("./vision-types").VisionDiagnosticsReport>;
  "vision:getWorkerStatus": () => Promise<import("./vision-types").VisionWorkerStatus>;
  "vision:startWorker": () => Promise<{ success: boolean; pid?: number; message?: string }>;
  "vision:stopWorker": () => Promise<{ success: boolean }>;
  "vision:getModels": () => Promise<import("./vision-models").VisionModelManifest[]>;
  "vision:verifyModel": (modelId: string) => Promise<import("./vision-models").ModelVerificationResult>;
  "vision:runBenchmark": (p: { modelId: string; provider?: import("./vision-types").InferenceProvider }) => Promise<import("./vision-models").InferenceBenchmarkResult>;
  "vision:probeVideo": (filePath: string) => Promise<import("./vision-jobs").VisionVideoMetadata>;
  "vision:getJobs": () => Promise<import("./vision-jobs").VisionJob[]>;
  "vision:createJob": (options: import("./vision-jobs").VisionJobOptions) => Promise<import("./vision-jobs").VisionJob>;
  "vision:pauseJob": (jobId: string) => Promise<boolean>;
  "vision:resumeJob": (jobId: string) => Promise<boolean>;
  "vision:cancelJob": (jobId: string) => Promise<boolean>;
  "vision:deleteJob": (jobId: string) => Promise<boolean>;
  "vision:clearCompletedJobs": () => Promise<void>;
  "gpu:getDiagnostics": () => Promise<import("./gpu-types").UnifiedGpuDiagnostics>;
};

export type IpcEvents = {
  "playback:pause": void;
  "notify:click": { id: string };
  "auth:callback": { token: string };
  "vision:workerStatusChanged": import("./vision-types").VisionWorkerStatus;
  "vision:jobProgress": import("./vision-jobs").VisionJobProgress;
  "vision:jobListChanged": import("./vision-jobs").VisionJob[];
  "updater:status": {
    status:
      | "idle"
      | "checking"
      | "available"
      | "not-available"
      | "downloading"
      | "verifying"
      | "downloaded"
      | "ready_to_install"
      | "error";
    version?: string;
    notes?: string;
    progress?: number;
    error?: string;
  };
};
