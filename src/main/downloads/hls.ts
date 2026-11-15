import { unwrapProxyUrl } from "../api/proxy";

export class HlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HlsError";
  }
}

export interface HlsKey {
  method: "AES-128" | "NONE";
  uri?: string;
  iv?: Buffer;
}

export interface HlsSegment {
  index: number;
  uri: string;
  duration: number;
  key?: HlsKey;
}

export interface HlsVariant {
  uri: string;
  bandwidth: number;
  resolution?: string;
}

export interface ParsedPlaylist {
  isMaster: boolean;
  variants: HlsVariant[];
  segments: HlsSegment[];
  targetDuration: number;
}

/**
 * Parses an m3u8 playlist string.
 * Enforces v1 constraints: throws on fMP4 (#EXT-X-MAP).
 */
export function parseM3u8(content: string, baseUrl: string): ParsedPlaylist {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());

  if (!lines.some((l) => l.startsWith("#EXTM3U"))) {
    throw new HlsError("Invalid HLS playlist: missing #EXTM3U header");
  }

  // Check for fMP4 (#EXT-X-MAP)
  if (lines.some((l) => l.startsWith("#EXT-X-MAP"))) {
    throw new HlsError("fMP4 (EXT-X-MAP) is unsupported in v1");
  }

  const isMaster = lines.some((l) => l.startsWith("#EXT-X-STREAM-INF"));

  if (isMaster) {
    const variants: HlsVariant[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const resMatch = line.match(/RESOLUTION=([0-9x]+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        const resolution = resMatch ? resMatch[1] : undefined;

        // Next non-empty, non-comment line is the URI
        let nextUri = "";
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j] && !lines[j].startsWith("#")) {
            nextUri = lines[j];
            i = j;
            break;
          }
        }

        if (nextUri) {
          const resolvedUri = resolveUrl(nextUri, baseUrl);
          variants.push({
            uri: resolvedUri,
            bandwidth,
            resolution,
          });
        }
      }
    }

    // Sort descending by bandwidth
    variants.sort((a, b) => b.bandwidth - a.bandwidth);

    return {
      isMaster: true,
      variants,
      segments: [],
      targetDuration: 0,
    };
  }

  // Media playlist
  let targetDuration = 10;
  let mediaSequence = 0;
  let currentKey: HlsKey | undefined;
  const segments: HlsSegment[] = [];

  let segDuration = 0;
  let segIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      const td = parseFloat(line.slice(22));
      if (!isNaN(td)) targetDuration = td;
      continue;
    }

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const ms = parseInt(line.slice(22), 10);
      if (!isNaN(ms)) mediaSequence = ms;
      continue;
    }

    if (line.startsWith("#EXT-X-KEY:")) {
      currentKey = parseKeyLine(line.slice(11), baseUrl);
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      const parts = line.slice(8).split(",");
      segDuration = parseFloat(parts[0]) || 0;
      continue;
    }

    if (line && !line.startsWith("#")) {
      const segmentSeq = mediaSequence + segIndex;
      let keyForSegment = currentKey;
      if (currentKey && currentKey.method === "AES-128" && !currentKey.iv) {
        // RFC 8216 §5.2: sequence number as 16-octet big-endian integer
        const ivBuf = Buffer.alloc(16);
        ivBuf.writeBigUInt64BE(BigInt(segmentSeq), 8);
        keyForSegment = { ...currentKey, iv: ivBuf };
      }

      segments.push({
        index: segIndex,
        uri: resolveUrl(line, baseUrl),
        duration: segDuration,
        key: keyForSegment,
      });

      segIndex++;
      segDuration = 0;
    }
  }

  return {
    isMaster: false,
    variants: [],
    segments,
    targetDuration,
  };
}

function parseKeyLine(attrs: string, baseUrl: string): HlsKey {
  const methodMatch = attrs.match(/METHOD=([^,\s]+)/);
  const method = (methodMatch ? methodMatch[1] : "NONE") as "AES-128" | "NONE";

  if (method !== "AES-128") {
    return { method: "NONE" };
  }

  const uriMatch = attrs.match(/URI="([^"]+)"/) || attrs.match(/URI=([^,\s]+)/);
  const uri = uriMatch ? resolveUrl(uriMatch[1], baseUrl) : undefined;

  let iv: Buffer | undefined;
  const ivMatch = attrs.match(/IV=(0x[0-9a-fA-F]+)/);
  if (ivMatch) {
    const hexStr = ivMatch[1].slice(2).padStart(32, "0");
    iv = Buffer.from(hexStr, "hex");
  }

  return {
    method,
    uri,
    iv,
  };
}

function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    const resolved = new URL(relativeOrAbsolute, baseUrl).href;
    return unwrapProxyUrl(resolved).url;
  } catch {
    return unwrapProxyUrl(relativeOrAbsolute).url;
  }
}
