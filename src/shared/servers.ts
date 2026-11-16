export type ProviderKind = "direct" | "embed" | "animesalt";
export type IdType = "anilist" | "mal" | "tmdb";

export interface StreamContext {
  id: number;
  episode: number;
  audio?: "sub" | "dub";
  tmdbId?: number;
  season?: number;
}

export interface ServerDef {
  id: string;
  name: string;
  kind: ProviderKind;
  idType: IdType;
  audioSwitchable: boolean;
  multiTrack: boolean;
  requiresExtension?: boolean;
  buildEmbedUrl?: (ctx: StreamContext) => string | null;
}

/**
 * Data-driven Server/Provider Registry.
 * Based on the analyzed provider registry shape from the upstream Zenkai engine.
 */
export const SERVERS: ServerDef[] = [
  // 1. Direct Providers (HLS Streams)
  {
    id: "megaplay",
    name: "MegaPlay (Direct)",
    kind: "direct",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
  },
  {
    id: "vidstream",
    name: "Vidstream (Direct)",
    kind: "direct",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
  },
  {
    id: "flixcloud",
    name: "FlixCloud (Multi-track)",
    kind: "direct",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: true,
  },
  {
    id: "acdn",
    name: "ACDN (Multi-Audio)",
    kind: "direct",
    idType: "anilist",
    audioSwitchable: false, // Dub-only on ACDN
    multiTrack: true,
    requiresExtension: false, // Electron main handles direct IP resolution
  },
  // 2. AnimeSalt Providers (Server-resolved multi-audio)
  {
    id: "animesalt-1",
    name: "AnimeSalt 1",
    kind: "animesalt",
    idType: "anilist",
    audioSwitchable: false,
    multiTrack: true,
  },
  {
    id: "animesalt-2",
    name: "AnimeSalt 2",
    kind: "animesalt",
    idType: "anilist",
    audioSwitchable: false,
    multiTrack: true,
  },
  // 3. Anime Embed Providers
  {
    id: "megaplay-embed",
    name: "MegaPlay (Embed)",
    kind: "embed",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
    buildEmbedUrl: (ctx) => `https://megaplay.example/embed/${ctx.id}/${ctx.episode}?audio=${ctx.audio || "sub"}`,
  },
  {
    id: "reanime",
    name: "ReAnime",
    kind: "embed",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
    buildEmbedUrl: (ctx) => `https://reanime.example/watch/${ctx.id}/${ctx.episode}`,
  },
  {
    id: "zokoranime",
    name: "ZokoAnime",
    kind: "embed",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
    buildEmbedUrl: (ctx) => `https://zokoanime.example/embed/${ctx.id}/${ctx.episode}?audio=${ctx.audio || "sub"}`,
  },
  {
    id: "tryembed",
    name: "TryEmbed",
    kind: "embed",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
    buildEmbedUrl: (ctx) => `https://tryembed.example/embed/${ctx.id}/${ctx.episode}?audio=${ctx.audio || "sub"}`,
  },
  {
    id: "vidnest",
    name: "Vidnest",
    kind: "embed",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
    buildEmbedUrl: (ctx) => `https://vidnest.example/embed/${ctx.id}/${ctx.episode}?audio=${ctx.audio || "sub"}`,
  },
  {
    id: "yumezone",
    name: "YumeZone",
    kind: "embed",
    idType: "anilist",
    audioSwitchable: true,
    multiTrack: false,
    buildEmbedUrl: (ctx) => `https://yumezone.example/embed/${ctx.id}/${ctx.episode}?audio=${ctx.audio || "sub"}`,
  },
  // 4. Movies & TV / TMDB Embed Providers
  {
    id: "vidzee",
    name: "VidZee",
    kind: "embed",
    idType: "tmdb",
    audioSwitchable: false,
    multiTrack: false,
    buildEmbedUrl: (ctx) =>
      ctx.tmdbId ? `https://vidzee.example/embed/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode}` : null,
  },
  {
    id: "vidlove",
    name: "VidLove",
    kind: "embed",
    idType: "tmdb",
    audioSwitchable: false,
    multiTrack: false,
    buildEmbedUrl: (ctx) =>
      ctx.tmdbId ? `https://vidlove.example/embed/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode}` : null,
  },
  {
    id: "1embed",
    name: "1Embed",
    kind: "embed",
    idType: "tmdb",
    audioSwitchable: false,
    multiTrack: false,
    buildEmbedUrl: (ctx) =>
      ctx.tmdbId ? `https://1embed.example/embed/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode}` : null,
  },
  {
    id: "cinemaos",
    name: "CinemaOS",
    kind: "embed",
    idType: "tmdb",
    audioSwitchable: false,
    multiTrack: false,
    buildEmbedUrl: (ctx) =>
      ctx.tmdbId ? `https://cinemaos.example/embed/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode}` : null,
  },
  {
    id: "2embed",
    name: "2Embed",
    kind: "embed",
    idType: "tmdb",
    audioSwitchable: false,
    multiTrack: false,
    buildEmbedUrl: (ctx) =>
      ctx.tmdbId ? `https://2embed.example/embed/${ctx.tmdbId}/${ctx.season || 1}/${ctx.episode}` : null,
  },
];

export function getServerDef(serverId: string): ServerDef | undefined {
  const normalized = serverId.toLowerCase().trim();
  return SERVERS.find((s) => s.id === normalized);
}

export function getAllServers(): ServerDef[] {
  return [...SERVERS];
}

export function getDirectServers(): ServerDef[] {
  return SERVERS.filter((s) => s.kind === "direct");
}

export function getEmbedServers(): ServerDef[] {
  return SERVERS.filter((s) => s.kind === "embed");
}

export function isAudioSwitchable(serverId: string): boolean {
  const def = getServerDef(serverId);
  return def ? def.audioSwitchable : true;
}
