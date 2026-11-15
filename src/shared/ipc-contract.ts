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
  }) => Promise<{ playable: boolean; reason?: string }>;
  "downloads:list": () => Promise<DownloadItem[]>;
  "downloads:remove": (id: string) => Promise<void>;
  "rpc:set": (p: {
    title: string;
    details?: string;
    startedAt?: number;
  }) => Promise<void>;
  "rpc:clear": () => Promise<void>;
  "app:version": () => Promise<string>;
};

export type IpcEvents = {
  "playback:pause": void;
  "notify:click": { id: string };
  "auth:callback": { token: string };
};
