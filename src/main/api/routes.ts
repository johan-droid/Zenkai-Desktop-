import type {
  Mapping,
  MappingResponse,
  StreamParams,
  StreamResult,
  SubtitlesResponse,
} from "../../shared/api-types";
import { fetchJson } from "./client";

export async function getStream(params: StreamParams): Promise<StreamResult> {
  const query = new URLSearchParams({
    id: String(params.id),
    ep: String(params.ep),
    server: params.server,
    audio: params.audio,
  });
  if (params.title) {
    query.set("title", params.title);
  }
  if (params.format) {
    query.set("format", params.format);
  }
  return fetchJson<StreamResult>(`/api/stream?${query.toString()}`);
}

export async function getMapping(anilistId: number): Promise<Mapping | null> {
  const res = await fetchJson<MappingResponse>(`/api/mapping/${anilistId}`);
  return res.data;
}

export async function getSubtitles(params: {
  id: number;
  ep: number;
  title?: string;
  format?: string;
}): Promise<SubtitlesResponse> {
  const query = new URLSearchParams({
    id: String(params.id),
    ep: String(params.ep),
  });
  if (params.title) {
    query.set("title", params.title);
  }
  if (params.format) {
    query.set("format", params.format);
  }
  return fetchJson<SubtitlesResponse>(`/api/subtitles?${query.toString()}`);
}

export interface AppRelease {
  version: string;
  notes?: string;
  url?: string;
  publishedAt?: string;
}

export async function getAppRelease(): Promise<AppRelease | null> {
  try {
    return await fetchJson<AppRelease>("/api/app/release");
  } catch {
    return null;
  }
}
