import { describe, expect, it } from "vitest";
// @ts-expect-error ssrf.js is JavaScript runtime module
import { validateProxyUrl } from "../../server/ssrf.js";

describe("SSRF proxy validation — maturity gate", () => {
  const BLOCKED = [
    "http://localhost/stream.m3u8",
    "http://127.0.0.1/file.ts",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://10.0.0.1/stream",
    "http://192.168.1.1/api",
    "http://172.16.0.1/",
    "http://host.internal/",
    "http://app.local/",
    "ftp://megaplay.buzz/stream.m3u8",
    "",
    "not-a-url",
  ];

  for (const url of BLOCKED) {
    it(`blocks: ${url || "(empty)"}`, () => {
      const r = validateProxyUrl(url);
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    });
  }

  const ALLOWED = [
    "https://megaplay.buzz/stream/1/1.m3u8",
    "https://acdn.top/seg-001.ts",
    "https://opensubtitles-v3.strem.io/subtitles/1.vtt",
    "https://image.tmdb.org/t/p/w500/poster.jpg",
    "https://as-cdn26.top/playlist.m3u8",
  ];

  for (const url of ALLOWED) {
    it(`allows: ${url}`, () => {
      const r = validateProxyUrl(url);
      expect(r.valid).toBe(true);
    });
  }

  it("rejects IPv6 loopback", () => {
    const r = validateProxyUrl("http://[::1]/stream");
    expect(r.valid).toBe(false);
  });

  it("validates URL object is returned on success", () => {
    const r = validateProxyUrl("https://megaplay.buzz/stream.m3u8");
    expect(r.valid).toBe(true);
    expect(r.url).toBeInstanceOf(URL);
  });
});
