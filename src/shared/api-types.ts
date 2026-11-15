// Copied directly from upstream nyyrox2/Zenkai: src/services/api.ts and server/handler.js

export interface SubtitleTrack {
  id?: string;
  file?: string;
  label: string;
  language?: string;
  lang?: string;
  url?: string;
  default?: boolean;
  source?: string;
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  default?: boolean;
}

export interface StreamResult {
  success?: boolean;
  server: string;
  serverId?: string;
  audio: "sub" | "dub" | "multi";
  multiAudio?: boolean;
  format?: "hls" | "file";
  streamUrl: string;
  rawUrl?: string;
  rawStreamUrl?: string;
  fallbackStreamUrl?: string;
  referer?: string;
  subtitles: SubtitleTrack[];
  audioTracks?: AudioTrack[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  clientResolved?: boolean;
}

export interface Mapping {
  anilist: number;
  mal: number | null;
  tmdb: { id: number; type: "tv" | "movie"; season: number | null } | null;
  tvdb: number | null;
  imdb: string | null;
  anidb: number | null;
  source: "anibridge" | "arm";
}

export interface MappingResponse {
  success: boolean;
  data: Mapping | null;
}

export interface SubtitlesResponse {
  success: boolean;
  subtitles: SubtitleTrack[];
}

export interface StreamParams {
  id: number;
  ep: number;
  server: string;
  audio: "sub" | "dub";
  title?: string;
  format?: string;
}

export interface ResolveStreamParams {
  anilistId: number;
  episode: number;
  audio: "sub" | "dub";
  server: string;
  title?: string;
  format?: string;
}

export interface ResolvedStream {
  m3uUrl: string;
  allowedHosts: string[];
  subtitles?: SubtitleTrack[];
  audioTracks?: AudioTrack[];
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  rawStreamUrl?: string;
  referer?: string;
}
