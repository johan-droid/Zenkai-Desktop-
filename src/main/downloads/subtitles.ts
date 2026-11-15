import fs from "node:fs";
import path from "node:path";
import { cuesToSrt, parseSubtitles } from "../../shared/subtitles";
import { fetchViaProxy } from "../api/proxy";
import { getMapping, getSubtitles } from "../api/routes";

export interface DownloadSubtitlesParams {
  anilistId: number;
  episode: number;
  destinationTsPath: string;
  title?: string;
  format?: string;
  allowedHosts?: string[];
  referer?: string;
}

export interface SubtitlesResult {
  saved: boolean;
  path?: string;
  reason?: string;
}

/**
 * Downloads subtitles for an episode and saves as .srt beside the .ts file.
 * If mapping or subtitles are unavailable, logs info and skips without failing the download.
 */
export async function downloadSubtitles(
  params: DownloadSubtitlesParams,
): Promise<SubtitlesResult> {
  const {
    anilistId,
    episode,
    destinationTsPath,
    title,
    format,
    allowedHosts = [],
    referer,
  } = params;

  // 1. Get IMDb id from mapping
  let mapping;
  try {
    mapping = await getMapping(anilistId);
  } catch (err: unknown) {
    console.info(
      `[subtitles] mapping failed for anilistId=${anilistId}: ${(err as Error).message}`,
    );
    return { saved: false, reason: "mapping_failed" };
  }

  const imdbId = mapping?.imdb;
  if (!imdbId) {
    console.info(
      `[subtitles] missing IMDb id for anilistId=${anilistId}; skipping subtitles`,
    );
    return { saved: false, reason: "missing_imdb_id" };
  }

  // 2. Fetch subtitles list
  let subsRes;
  try {
    subsRes = await getSubtitles({
      id: anilistId,
      ep: episode,
      title,
      format,
    });
  } catch (err: unknown) {
    console.info(
      `[subtitles] /api/subtitles failed for anilistId=${anilistId}: ${(err as Error).message}`,
    );
    return { saved: false, reason: "subtitles_api_failed" };
  }

  const subtitlesList = subsRes?.subtitles || [];
  if (subtitlesList.length === 0) {
    console.info(
      `[subtitles] no subtitles available for anilistId=${anilistId}, ep=${episode}`,
    );
    return { saved: false, reason: "no_subtitles_found" };
  }

  // 3. Pick English or default subtitle
  const chosenSub =
    subtitlesList.find(
      (s) =>
        s.default ||
        s.language?.toLowerCase() === "english" ||
        s.lang?.toLowerCase() === "eng",
    ) || subtitlesList[0];

  const subUrl = chosenSub.file || chosenSub.url;
  if (!subUrl) {
    return { saved: false, reason: "no_subtitle_url" };
  }

  // 4. Download subtitle content
  let subContent = "";
  try {
    if (subUrl.startsWith("http")) {
      const parsedHost = new URL(subUrl).hostname.toLowerCase();
      const hosts = [...allowedHosts, parsedHost];
      const res = await fetchViaProxy(subUrl, hosts, referer).catch(() =>
        fetch(subUrl),
      );
      subContent = await res.text();
    } else {
      // Relative or internal
      const res = await fetchViaProxy(
        `https://zenkai-web.pages.dev${subUrl}`,
        [...allowedHosts, "zenkai-web.pages.dev"],
        referer,
      );
      subContent = await res.text();
    }
  } catch (err: unknown) {
    console.info(
      `[subtitles] failed downloading subtitle content from ${subUrl}: ${(err as Error).message}`,
    );
    return { saved: false, reason: "download_failed" };
  }

  if (!subContent || subContent.trim().length === 0) {
    return { saved: false, reason: "empty_content" };
  }

  // 5. Convert WebVTT or ASS to SRT if needed
  const srtContent = convertToSrt(subContent);

  // 6. Save .srt beside the .ts file
  const baseName = destinationTsPath.replace(/\.(ts|part)$/, "");
  const srtPath = `${baseName}.srt`;

  await fs.promises.mkdir(path.dirname(srtPath), { recursive: true });
  await fs.promises.writeFile(srtPath, srtContent, "utf-8");

  return {
    saved: true,
    path: srtPath,
  };
}

/**
 * Converts WebVTT / ASS to numbered SRT using the unified subtitle engine.
 */
function convertToSrt(content: string): string {
  // If already standard SRT (starts with digit and contains --> with commas)
  if (/^\d+\r?\n\d\d:\d\d:\d\d,\d\d\d\s*-->/m.test(content)) {
    return content;
  }

  const cues = parseSubtitles(content);
  if (cues.length > 0) {
    return cuesToSrt(cues);
  }

  // Fallback: return as-is
  return content;
}
