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
};

export type IpcEvents = {
  "playback:pause": void;
  "notify:click": { id: string };
  "auth:callback": { token: string };
  "updater:status": {
    status:
      | "idle"
      | "checking"
      | "available"
      | "not-available"
      | "downloading"
      | "downloaded"
      | "error";
    version?: string;
    notes?: string;
    progress?: number;
    error?: string;
  };
};
