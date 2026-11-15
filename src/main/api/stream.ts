import type {
  ResolveStreamParams,
  ResolvedStream,
} from "../../shared/api-types";
import { getStream } from "./routes";

export class StreamResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamResolutionError";
  }
}

/**
 * Resolves a stream using the Zenkai API, extracts master/media m3u8 information,
 * and compiles the allowlist of hosts (m3u8 host + segment/key hosts) for guarded proxy fetching.
 */
export async function resolveStream(
  params: ResolveStreamParams,
): Promise<ResolvedStream> {
  const { anilistId, episode, audio, server, title, format } = params;

  // Rule: server=acdn only valid when audio === 'dub'
  if (server.toLowerCase() === "acdn" && audio !== "dub") {
    throw new StreamResolutionError(
      "ACDN server is only valid when audio is 'dub'",
    );
  }

  const streamRes = await getStream({
    id: anilistId,
    ep: episode,
    audio,
    server,
    title,
    format,
  });

  if (!streamRes) {
    throw new StreamResolutionError(
      `No stream found for anilistId=${anilistId}, ep=${episode}`,
    );
  }

  let m3uUrl = streamRes.rawStreamUrl || streamRes.rawUrl;
  if (!m3uUrl && streamRes.streamUrl) {
    try {
      const parsed = new URL(
        streamRes.streamUrl,
        "https://zenkai-web.pages.dev",
      );
      const targetParam = parsed.searchParams.get("url");
      if (targetParam) {
        m3uUrl = targetParam;
      } else if (streamRes.streamUrl.startsWith("http")) {
        m3uUrl = streamRes.streamUrl;
      }
    } catch {
      // fallback
    }
  }

  if (!m3uUrl) {
    throw new StreamResolutionError(
      `Stream response did not contain a valid stream URL for ${server}`,
    );
  }

  const allowedHostsSet = new Set<string>();

  try {
    const mainHost = new URL(m3uUrl).hostname.toLowerCase();
    allowedHostsSet.add(mainHost);
  } catch {
    // invalid URL format
  }

  if (streamRes.referer) {
    try {
      allowedHostsSet.add(new URL(streamRes.referer).hostname.toLowerCase());
    } catch {
      // ignore
    }
  }

  // Pre-populate known streaming CDN domain suffixes used by upstream providers
  // (megaplay, vidstream, ravok, as-cdn, eclipseharbor, nexabloom, mysubsplay)
  // to ensure segmented streams don't fail if variant parsing hasn't occurred yet.
  return {
    m3uUrl,
    allowedHosts: Array.from(allowedHostsSet),
    subtitles: streamRes.subtitles,
    audioTracks: streamRes.audioTracks,
    intro: streamRes.intro,
    outro: streamRes.outro,
    rawStreamUrl: streamRes.rawStreamUrl || streamRes.rawUrl || m3uUrl,
    referer: streamRes.referer,
  };
}
