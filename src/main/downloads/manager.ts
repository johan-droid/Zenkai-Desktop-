import { app, BrowserWindow } from "electron";
import { once } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { resolveStream } from "../api/stream";
import { showNotification } from "../notify";
import { getSettings } from "../settings";
import { downloadHlsStream } from "./hls-download";
import { sanitizeFilename } from "./sanitize";
import { downloadSubtitles } from "./subtitles";
import { log } from "../logger";

export interface DownloadEntry {
  id: string;
  name: string;
  status: "queued" | "active" | "paused" | "done" | "error";
  bytes: number;
  total: number;
  url?: string; // persisted for relaunch resume; never returned over IPC
  anilistId?: number;
  episode?: number;
  audio?: "sub" | "dub";
  server?: string;
  withSubtitles?: boolean;
  segmentsTotal?: number;
  segmentsDone?: number;
  path?: string;
  title?: string;
  format?: string;
  error?: string;
}

export type PublicDownload = Omit<DownloadEntry, "url">;

export const MAX_ACTIVE = 3;

const items = new Map<string, DownloadEntry>();
const controllers = new Map<string, AbortController>();
let loaded = false;

const indexFile = (): string =>
  path.join(app.getPath("userData"), "downloads.json");
const downloadDir = (): string => getSettings().downloadDir;
const partOf = (e: DownloadEntry): string =>
  path.join(downloadDir(), `${e.name}.part`);
const finalOf = (e: DownloadEntry): string => path.join(downloadDir(), e.name);

function persist(): void {
  const file = indexFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...items.values()], null, 2));
  fs.renameSync(tmp, file);
}

export function updateTaskbarProgress(): void {
  try {
    if (typeof BrowserWindow === "undefined" || !BrowserWindow.getAllWindows) return;
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win || typeof win.setProgressBar !== "function") return;
    const active = [...items.values()].filter((d) => d.status === "active");
    if (active.length === 0) {
      win.setProgressBar(-1);
      return;
    }
    const avg =
      active.reduce(
        (acc, d) => acc + (d.total > 0 ? d.bytes / d.total : 0),
        0,
      ) / active.length;
    win.setProgressBar(Math.max(0, Math.min(1, avg)));
  } catch {
    // Non-fatal if running in headless or test environment
  }
}

export async function canFitDownload(estimatedBytes = 250 * 1024 * 1024): Promise<{
  ok: boolean;
  freeBytes: number;
  requiredBytes: number;
}> {
  const dir = downloadDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const st = await fsp.statfs(dir);
    const freeBytes = st.bavail * st.bsize;
    const requiredBytes = Math.round(estimatedBytes * 1.15); // 15% safety headroom
    return { ok: freeBytes >= requiredBytes, freeBytes, requiredBytes };
  } catch {
    return { ok: true, freeBytes: 0, requiredBytes: estimatedBytes };
  }
}

function loadIndex(): void {
  if (loaded) return;
  loaded = true;
  let raw: string;
  try {
    raw = fs.readFileSync(indexFile(), "utf8");
  } catch {
    return; // no index yet
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[downloads] corrupt index ignored");
    return;
  }
  if (!Array.isArray(parsed)) {
    console.warn("[downloads] malformed index ignored");
    return;
  }
  for (const e of parsed as Partial<DownloadEntry>[]) {
    if (!e || typeof e.id !== "string" || typeof e.name !== "string") continue;
    const entry: DownloadEntry = {
      id: e.id,
      name: e.name,
      status: e.status === "done" || e.status === "error" ? e.status : "queued",
      bytes: typeof e.bytes === "number" ? e.bytes : 0,
      total: typeof e.total === "number" ? e.total : 0,
      url: typeof e.url === "string" ? e.url : undefined,
      anilistId: typeof e.anilistId === "number" ? e.anilistId : undefined,
      episode: typeof e.episode === "number" ? e.episode : undefined,
      audio: e.audio === "sub" || e.audio === "dub" ? e.audio : undefined,
      server: typeof e.server === "string" ? e.server : undefined,
      withSubtitles: e.withSubtitles,
      segmentsTotal: e.segmentsTotal,
      segmentsDone: e.segmentsDone,
      path: e.path,
      title: e.title,
      format: e.format,
      error: e.error,
    };
    if (entry.status === "queued") {
      if (!entry.url && !entry.anilistId) {
        entry.status = "error"; // nothing to resume from
      } else {
        // interrupted by a previous run: .part is the source of truth for bytes
        try {
          entry.bytes = fs.statSync(partOf(entry)).size;
        } catch {
          entry.bytes = 0;
        }
      }
    }
    items.set(entry.id, entry);
  }
}

function pump(): void {
  let active = 0;
  for (const e of items.values()) if (e.status === "active") active++;
  for (const e of items.values()) {
    if (active >= MAX_ACTIVE) break;
    if (e.status === "queued" && (e.url || e.anilistId)) {
      active++;
      void run(e);
    }
  }
}

async function run(e: DownloadEntry): Promise<void> {
  e.status = "active";
  const controller = new AbortController();
  controllers.set(e.id, controller);
  persist();
  updateTaskbarProgress();
  log.download.info(`Starting download worker for "${e.name}" (${e.id})`);
  try {
    // Disk space guard (B3)
    const dir = downloadDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
      const st = await fsp.statfs(dir);
      const freeBytes = st.bavail * st.bsize;
      const estimated = e.total > 0 ? e.total : 250 * 1024 * 1024;
      const required = Math.round(estimated * 1.15); // 15% safety margin
      if (freeBytes > 0 && freeBytes < required) {
        const needMb = Math.round(required / (1024 * 1024));
        const freeMb = Math.round(freeBytes / (1024 * 1024));
        throw new Error(
          `Insufficient disk space: need at least ${needMb}MB, available ${freeMb}MB`,
        );
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith("Insufficient disk space")
      ) {
        throw err;
      }
    }

    if (e.anilistId && e.episode && e.server && e.audio) {
      await downloadHls(e, controller.signal);
    } else {
      await downloadDirect(e, controller.signal);
    }

    if (items.has(e.id)) {
      e.status = "done";
      log.download.success(`Download completed: "${e.name}" (${e.path})`);
      try {
        showNotification({
          id: e.id,
          title: "Download complete",
          body: e.name,
        });
      } catch (err) {
        console.warn(
          "[notify] failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    if (!items.has(e.id)) return; // removed mid-flight
    e.status = "error";
    e.error = err instanceof Error ? err.message : String(err);
    log.download.error(`Download failed ["${e.name}"]:`, e.error);
    console.error(
      `[downloads] ${e.id} failed:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    controllers.delete(e.id);
    if (items.has(e.id)) persist();
    updateTaskbarProgress();
    pump();
  }
}

async function downloadHls(
  e: DownloadEntry,
  signal: AbortSignal,
): Promise<void> {
  const dir = downloadDir();
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = finalOf(e);
  e.path = finalPath;

  const streamInfo = await resolveStream({
    anilistId: e.anilistId!,
    episode: e.episode!,
    audio: e.audio!,
    server: e.server!,
    title: e.title,
    format: e.format,
  });

  const res = await downloadHlsStream({
    masterM3uUrl: streamInfo.m3uUrl,
    allowedHosts: streamInfo.allowedHosts,
    referer: streamInfo.referer,
    outputPath: finalPath,
    startSegmentIndex: e.segmentsDone ?? 0,
    signal,
    onProgress: (done, total) => {
      e.segmentsDone = done;
      e.segmentsTotal = total;
      e.bytes = done;
      e.total = total;
      persist();
      updateTaskbarProgress();
    },
  });

  e.segmentsDone = res.segmentsDone;
  e.segmentsTotal = res.segmentsTotal;
  e.bytes = res.segmentsDone;
  e.total = res.segmentsTotal;

  // Subtitles
  if (e.withSubtitles) {
    await downloadSubtitles({
      anilistId: e.anilistId!,
      episode: e.episode!,
      destinationTsPath: finalPath,
      title: e.title,
      format: e.format,
      allowedHosts: streamInfo.allowedHosts,
      referer: streamInfo.referer,
    }).catch((err) => {
      console.info("[downloads] subtitles failed:", err);
    });
  }
}

async function downloadDirect(
  e: DownloadEntry,
  signal: AbortSignal,
): Promise<void> {
  const dir = downloadDir();
  fs.mkdirSync(dir, { recursive: true });
  const part = partOf(e);
  const finalPath = finalOf(e);
  e.path = finalPath;

  let offset = 0;
  try {
    offset = fs.statSync(part).size;
  } catch {
    offset = 0;
  }

  let append = false;
  let res: Response;
  if (offset > 0) {
    res = await fetch(e.url!, {
      headers: { Range: `bytes=${offset}-` },
      signal,
    });
    if (res.status === 206) {
      append = true;
    } else if (res.status === 416) {
      void res.body?.cancel().catch(() => {});
      fs.rmSync(part, { force: true });
      offset = 0;
      res = await fetch(e.url!, { signal });
    } else {
      offset = 0;
    }
  } else {
    res = await fetch(e.url!, { signal });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let total = 0;
  if (append) {
    const cr = res.headers.get("content-range");
    const m = cr ? /\/(\d+)\s*$/.exec(cr) : null;
    total = m ? Number(m[1]) : 0;
  } else {
    const cl = res.headers.get("content-length");
    total = cl ? Number(cl) : 0;
  }
  e.total = total;
  e.bytes = offset;

  const ws = fs.createWriteStream(part, { flags: append ? "a" : "w" });
  let bytes = offset;
  try {
    if (!res.body) throw new Error("empty response body");
    for await (const chunk of Readable.fromWeb(
      res.body as unknown as import("node:stream/web").ReadableStream,
    )) {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      bytes += buf.length;
      e.bytes = bytes;
      if (!ws.write(buf)) await once(ws, "drain");
    }
    ws.end();
    await finished(ws);
  } catch (err) {
    ws.destroy();
    throw err;
  }
  fs.renameSync(part, finalPath);
  e.bytes = bytes;
}

export function startDownload(p: {
  id: string;
  url?: string;
  name?: string;
  anilistId?: number;
  episode?: number;
  audio?: "sub" | "dub";
  server?: string;
  withSubtitles?: boolean;
  title?: string;
  format?: string;
}): void {
  loadIndex();
  const existing = items.get(p.id);
  if (
    existing &&
    (existing.status === "active" || existing.status === "queued")
  ) {
    return;
  }

  const filename = p.name
    ? sanitizeFilename(p.name)
    : p.anilistId && p.episode
      ? sanitizeFilename(
          `${p.title ? `${p.title}_` : ""}${p.anilistId}_E${p.episode}_${p.audio || "sub"}_${p.server || "megaplay"}.ts`,
        )
      : sanitizeFilename(`download_${p.id}.ts`);

  items.set(p.id, {
    id: p.id,
    url: p.url,
    name: filename,
    status: "queued",
    bytes: 0,
    total: 0,
    anilistId: p.anilistId,
    episode: p.episode,
    audio: p.audio,
    server: p.server,
    withSubtitles: p.withSubtitles,
    segmentsTotal: 0,
    segmentsDone: 0,
    title: p.title,
    format: p.format,
  });
  persist();
  pump();
}

export function listDownloads(): PublicDownload[] {
  loadIndex();
  return [...items.values()].map((e) => {
    if (e.anilistId !== undefined) {
      return {
        id: e.id,
        name: e.name,
        status: e.status,
        bytes: e.bytes,
        total: e.total,
        anilistId: e.anilistId,
        episode: e.episode,
        audio: e.audio,
        server: e.server,
        segmentsTotal: e.segmentsTotal,
        segmentsDone: e.segmentsDone,
        path: e.path,
        error: e.error,
      };
    }
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      bytes: e.bytes,
      total: e.total,
    };
  });
}

export function removeDownload(id: string): void {
  loadIndex();
  const e = items.get(id);
  if (!e) return;
  controllers.get(id)?.abort();
  items.delete(id);
  if (e.status !== "done") {
    try {
      fs.rmSync(partOf(e), { force: true });
    } catch {}
  }
  persist();
  updateTaskbarProgress();
}

export function resumeDownloads(): void {
  loadIndex();
  pump();
}

export async function storageUsage(): Promise<{
  usedBytes: number;
  freeBytes: number;
}> {
  loadIndex();
  let usedBytes = 0;
  for (const e of items.values()) usedBytes += e.bytes;
  const dir = downloadDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const st = await fsp.statfs(dir);
    return { usedBytes, freeBytes: st.bavail * st.bsize };
  } catch {
    return { usedBytes, freeBytes: 0 };
  }
}
