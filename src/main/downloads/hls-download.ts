import crypto from "node:crypto";
import fs from "node:fs";
import { fetchViaProxy } from "../api/proxy";
import { HlsError, type HlsSegment, parseM3u8 } from "./hls";

export interface HlsDownloadOptions {
  masterM3uUrl: string;
  allowedHosts: string[];
  referer?: string;
  outputPath: string; // Destination .ts file
  startSegmentIndex?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface HlsDownloadResult {
  segmentsTotal: number;
  segmentsDone: number;
  outputPath: string;
}

/**
 * Downloads an HLS stream:
 * - Fetches master playlist, selects highest bandwidth variant
 * - Fetches media playlist and parses segments & AES-128 keys
 * - Concurrency 6 segments
 * - In-memory AES-128 decryption (keys never touch disk per §8 security rules)
 * - Writes strictly in sequential order to .part file
 * - Renames to .ts on completion
 */
export async function downloadHlsStream(
  opts: HlsDownloadOptions,
): Promise<HlsDownloadResult> {
  const {
    masterM3uUrl,
    allowedHosts,
    referer,
    outputPath,
    startSegmentIndex = 0,
    onProgress,
    signal,
  } = opts;

  if (signal?.aborted) {
    throw new Error("Download aborted");
  }

  // 1. Fetch playlist
  const allowed = [...allowedHosts];
  try {
    const uHost = new URL(masterM3uUrl).hostname.toLowerCase();
    if (!allowed.includes(uHost)) allowed.push(uHost);
  } catch {}

  const initialRes = await fetchViaProxy(masterM3uUrl, allowed, referer);
  const initialText = await initialRes.text();
  let playlist = parseM3u8(initialText, masterM3uUrl);

  let mediaPlaylistUrl = masterM3uUrl;

  // If master playlist, select highest bandwidth variant
  if (playlist.isMaster) {
    if (playlist.variants.length === 0) {
      throw new HlsError("Master playlist contains no variants");
    }
    const bestVariant = playlist.variants[0];
    mediaPlaylistUrl = bestVariant.uri;

    try {
      const vHost = new URL(mediaPlaylistUrl).hostname.toLowerCase();
      if (!allowed.includes(vHost)) allowed.push(vHost);
    } catch {}

    const variantRes = await fetchViaProxy(mediaPlaylistUrl, allowed, referer);
    const variantText = await variantRes.text();
    playlist = parseM3u8(variantText, mediaPlaylistUrl);
  }

  const allSegments = playlist.segments;
  const segmentsTotal = allSegments.length;
  if (segmentsTotal === 0) {
    throw new HlsError("Media playlist contains no segments");
  }

  // Collect hostnames of all segment & key URLs
  for (const seg of allSegments) {
    try {
      const sHost = new URL(seg.uri).hostname.toLowerCase();
      if (!allowed.includes(sHost)) allowed.push(sHost);
    } catch {}
    if (seg.key?.uri) {
      try {
        const kHost = new URL(seg.key.uri).hostname.toLowerCase();
        if (!allowed.includes(kHost)) allowed.push(kHost);
      } catch {}
    }
  }

  const partPath = outputPath.endsWith(".part")
    ? outputPath
    : `${outputPath}.part`;

  // File open mode: 'a' if resuming, 'w' if starting fresh
  const writeFlags = startSegmentIndex > 0 && fs.existsSync(partPath) ? "a" : "w";
  const fileHandle = await fs.promises.open(partPath, writeFlags);

  let nextWriteIndex = startSegmentIndex;
  let segmentsDone = startSegmentIndex;

  // In-memory key cache: URL -> Buffer (kept in memory only!)
  const keyCache = new Map<string, Buffer>();

  async function getKeyBytes(keyUri: string): Promise<Buffer> {
    const cached = keyCache.get(keyUri);
    if (cached) return cached;

    const res = await fetchViaProxy(keyUri, allowed, referer);
    const keyBuf = Buffer.from(await res.arrayBuffer());
    keyCache.set(keyUri, keyBuf);
    return keyBuf;
  }

  // Buffer for completed segments waiting to be written in sequence
  const pendingWrites = new Map<number, Buffer>();

  async function writePending(): Promise<void> {
    while (pendingWrites.has(nextWriteIndex)) {
      const chunk = pendingWrites.get(nextWriteIndex)!;
      pendingWrites.delete(nextWriteIndex);
      await fileHandle.write(chunk);
      nextWriteIndex++;
      segmentsDone = nextWriteIndex;
      onProgress?.(segmentsDone, segmentsTotal);
    }
  }

  try {
    // Segments to download
    const remainingSegments = allSegments.slice(startSegmentIndex);
    let currentQueueIdx = 0;
    const concurrency = 6;

    async function worker(): Promise<void> {
      while (currentQueueIdx < remainingSegments.length) {
        if (signal?.aborted) {
          throw new Error("Download aborted");
        }

        const seg = remainingSegments[currentQueueIdx++];
        if (!seg) break;

        const res = await fetchViaProxy(seg.uri, allowed, referer);
        let segmentData = Buffer.from(await res.arrayBuffer());

        // Decrypt AES-128 if encrypted
        if (seg.key?.method === "AES-128" && seg.key.uri) {
          const keyBytes = await getKeyBytes(seg.key.uri);
          const iv = seg.key.iv || Buffer.alloc(16);
          const decipher = crypto.createDecipheriv("aes-128-cbc", keyBytes, iv);
          segmentData = Buffer.concat([
            decipher.update(segmentData),
            decipher.final(),
          ]);
        }

        pendingWrites.set(seg.index, segmentData);
        await writePending();
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    await writePending();
  } finally {
    await fileHandle.close();
  }

  if (signal?.aborted) {
    throw new Error("Download aborted");
  }

  // Rename .part -> .ts on completion
  if (segmentsDone >= segmentsTotal) {
    const finalTsPath = partPath.endsWith(".part")
      ? partPath.slice(0, -5)
      : outputPath;
    await fs.promises.rename(partPath, finalTsPath);
    return {
      segmentsTotal,
      segmentsDone,
      outputPath: finalTsPath,
    };
  }

  return {
    segmentsTotal,
    segmentsDone,
    outputPath: partPath,
  };
}
