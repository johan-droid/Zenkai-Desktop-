import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const FORBIDDEN_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "169.254.169.254", // AWS/Cloud metadata
  "metadata.google.internal",
  "instance-data"
]);

const PRIVATE_V4 = [
  { min: "0.0.0.0", max: "0.255.255.255" }, // "this" network
  { min: "10.0.0.0", max: "10.255.255.255" }, // RFC1918
  { min: "100.64.0.0", max: "100.127.255.255" }, // CGNAT
  { min: "127.0.0.0", max: "127.255.255.255" }, // loopback
  { min: "169.254.0.0", max: "169.254.255.255" }, // link-local + cloud metadata
  { min: "172.16.0.0", max: "172.31.255.255" }, // RFC1918
  { min: "192.0.0.0", max: "192.0.0.255" }, // IETF protocol assignments
  { min: "192.168.0.0", max: "192.168.255.255" }, // RFC1918
  { min: "198.18.0.0", max: "198.19.255.255" }, // benchmarking
  { min: "224.0.0.0", max: "239.255.255.255" }, // multicast
  { min: "240.0.0.0", max: "255.255.255.255" }, // reserved + broadcast
];

function v4ToInt(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isPrivateAddress(ip) {
  if (!ip || typeof ip !== "string") return false;
  const version = isIP(ip);

  if (version === 4) {
    const value = v4ToInt(ip);
    return PRIVATE_V4.some(
      (range) => value >= v4ToInt(range.min) && value <= v4ToInt(range.max)
    );
  }

  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    // Unique-local (fc00::/7) and link-local / site-local (fe80::/10, fec0::/10)
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89a-f][0-9a-f]:/.test(lower)) return true;
    // Discard (100::/64) and documentation / benchmarking (2001:db8::/32, 2001:2::/48)
    if (/^100::/.test(lower) || /^2001:db8:/i.test(lower) || /^2001:2:/i.test(lower)) return true;
    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:0:a.b.c.d)
    const mapped = lower.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    // IPv4-compatible (::a.b.c.d)
    const compatible = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (compatible) return isPrivateAddress(compatible[1]);
    return false;
  }

  return false;
}

export class BlockedUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export function hostAllowed(host, allowlist) {
  if (!allowlist || allowlist.length === 0) return false;
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

// Allowed streaming CDN domains and video providers
export const ALLOWED_STREAM_DOMAINS = [
  "megaplay.buzz",
  "nexabloom.top",
  "stellarfrontier.world",
  "phantomharbor.top",
  "shadowharbor.top",
  "hiddenvertex.top",
  "emeralddrift.top",
  "eclipseharbor.space",
  "broforgotsave.online",
  "imgnex.top",
  "akirax.top",
  "shiora.top",
  "krussdomi.com",
  "advancedairesearchlab.top",
  "animeapps.top",
  "nukitashi.top",
  "playeng.animeapps.top",
  "novelfire.net",
  "novelfull.com",
  "anikototv.to",
  "animegg.org",
  "anineko.to",
  "anizone.to",
  "aniwave.to",
  "animesalt.cx",
  "animesalt.ac",
  "animesalt.ro",
  "ravok.buzz",
  "acdn.top",
  "flixcloud.cc",
  "enc-dec.app",
  "reanime.to",
  "reanime.cz",
  "atomic4cdn.com",
  "rundowncdn.com",
  "rundowncdn.top",
  "vividcdn.com",
  "vividcdn.top",
  "fallencdn.com",
  "fallencdn.top",
  "akamaized.net",
  "cloudflare.com",
  "workers.dev",
  "opensubtitles.org",
  "opensubtitles-v3.strem.io",
  "strem.io",
  "tmdb.org",
  "themoviedb.org",
  "image.tmdb.org",
  "demonicscans.org",
  "demoniclibs.com",
  "mangafifth.org",
  "readermc.org",
  "silentforge.top",
  "silentforge.space",
  "short.ink",
  "iamcdn.net",
  "as-cdn.top",
  "mysubsplay.com",
  "aoneroom.com",
  "hakunaymatata.com",
  "inmoviebox.com",
  "moviebox.ph",
  "movie-box.co",
  "movieboxonline.net",
  "123moviesfree.club",
  "sflix.film"
];

/**
 * Validates a target URL and asynchronously resolves it, ensuring every DNS record
 * points to a public, non-private IP address.
 */
export async function assertSafeUrl(rawUrl, options = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("malformed URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(`unsupported protocol: ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new BlockedUrlError("credentials in URL are not allowed");
  }

  const host = url.hostname.toLowerCase();

  // Explicit forbidden host check
  if (FORBIDDEN_HOSTNAMES.has(host)) {
    throw new BlockedUrlError(`Target host restricted (SSRF prevention): ${host}`);
  }

  // Internal suffixes
  if (host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".lan")) {
    throw new BlockedUrlError(`Internal network targets prohibited: ${host}`);
  }

  if (options.allowlist && options.allowlist.length > 0) {
    if (!hostAllowed(host, options.allowlist)) {
      throw new BlockedUrlError(`host not in allowlist: ${host}`);
    }
  }

  const literal = isIP(host);
  if (literal) {
    if (isPrivateAddress(host)) throw new BlockedUrlError(`private address blocked: ${host}`);
    return { url, address: host };
  }

  let records;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(`DNS resolution failed: ${host}`);
  }

  if (!records || records.length === 0) {
    throw new BlockedUrlError(`no DNS records for ${host}`);
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new BlockedUrlError(`host resolves to a private address: ${host} -> ${record.address}`);
    }
  }

  return { url, address: records[0].address };
}

export function validateProxyUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Missing URL parameter" };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTP and HTTPS protocols permitted" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: "Credentials in URL are not permitted" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 1. Strict loopback / metadata block
  if (FORBIDDEN_HOSTNAMES.has(hostname)) {
    return { valid: false, error: "Target host restricted (SSRF prevention)" };
  }

  // 2. Private IP range block
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    return { valid: false, error: "Private IP addresses prohibited" };
  }
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/.test(hostname)) {
    return { valid: false, error: "Private IP addresses prohibited" };
  }

  // Internal suffixes
  if (hostname.endsWith(".internal") || hostname.endsWith(".local") || hostname.endsWith(".lan")) {
    return { valid: false, error: "Internal network targets prohibited" };
  }

  // 3. Domain validation: Host must match allowed streaming domains or media patterns
  const isMediaPattern =
    /\.(m3u8|ts|m4s|m3u|mp4|vtt|srt|key|jpg|jpeg|png|webp|avif|gif)(\?.*)?$/i.test(parsed.pathname) ||
    /cdn|stream|video|m3u8|hls|media|chunk|segment|seg-|sub|caption|fetch|anime|harbor|drift|frontier|vertex|space|sora/i.test(hostname) ||
    /stream|anime|subtitles|sora/i.test(parsed.pathname) ||
    /^as-cdn\d*\.top$/i.test(hostname); // ACDN players (as-cdn26.top, ...)

  const isAllowed = ALLOWED_STREAM_DOMAINS.some(domain =>
    hostname === domain || hostname.endsWith("." + domain)
  ) || isMediaPattern;

  if (!isAllowed) {
    return { valid: false, error: "Target host not in permitted media streaming list" };
  }

  return { valid: true, url: parsed };
}

// =====================================================================
// 5. ABUSE SIGNALS CHECK
