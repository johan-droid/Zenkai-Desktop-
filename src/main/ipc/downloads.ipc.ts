import { app, ipcMain } from "electron";
import { z } from "zod";
import { resolveStream } from "../api/stream";
import {
  listDownloads,
  removeDownload,
  resumeDownloads,
  startDownload,
} from "../downloads/manager";

const HttpUrl = z.string().url().refine((u) => {
  const proto = new URL(u).protocol;
  return proto === "http:" || proto === "https:";
}, "only http/https URLs are allowed");

const StartV3Input = z.object({
  id: z.string().min(1).max(128),
  anilistId: z.number().int().gt(0),
  episode: z.number().int().min(1),
  audio: z.enum(["sub", "dub"]),
  server: z.string().max(32).regex(/^[a-z0-9_-]+$/i),
  withSubtitles: z.boolean().default(true),
  name: z.string().max(1024).optional(),
});

const StartLegacyInput = z.object({
  id: z.string().min(1).max(128),
  url: HttpUrl,
  name: z.string().min(1).max(1024),
});

const StartInput = z.union([StartV3Input, StartLegacyInput]);

const ResolveInput = z.object({
  anilistId: z.number().int().gt(0),
  episode: z.number().int().min(1),
  audio: z.enum(["sub", "dub"]),
  server: z.string().max(32).regex(/^[a-z0-9_-]+$/i),
});

const RemoveInput = z.string().min(1).max(128);
const NoInput = z.undefined();

function reject(channel: string, issues: unknown): never {
  console.error(`[ipc] invalid payload for ${channel}`, issues);
  throw new Error(`invalid payload for ${channel}`);
}

ipcMain.handle("downloads:resolve", async (_e, raw: unknown) => {
  const parsed = ResolveInput.safeParse(raw);
  if (!parsed.success) reject("downloads:resolve", parsed.error.issues);
  try {
    const res = await resolveStream(parsed.data);
    return { playable: !!res.m3uUrl };
  } catch (err: unknown) {
    return {
      playable: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("downloads:start", async (_e, raw: unknown) => {
  const parsed = StartInput.safeParse(raw);
  if (!parsed.success) reject("downloads:start", parsed.error.issues);
  startDownload(parsed.data);
});

ipcMain.handle("downloads:list", async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) reject("downloads:list", parsed.error.issues);
  return listDownloads();
});

ipcMain.handle("downloads:remove", async (_e, raw: unknown) => {
  const parsed = RemoveInput.safeParse(raw);
  if (!parsed.success) reject("downloads:remove", parsed.error.issues);
  removeDownload(parsed.data);
});

// Resume downloads interrupted by a previous run — deferred to app ready
app.whenReady().then(() => resumeDownloads());
