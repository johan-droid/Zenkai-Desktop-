import { describe, expect, it } from "vitest";
// @ts-expect-error ssrf.js is JavaScript runtime module
import { validateProxyUrl, isPrivateAddress, assertSafeUrl, BlockedUrlError } from "../../server/ssrf.js";

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

  describe("isPrivateAddress classification", () => {
    it("identifies private IPv4 addresses correctly", () => {
      expect(isPrivateAddress("127.0.0.1")).toBe(true);
      expect(isPrivateAddress("10.0.0.1")).toBe(true);
      expect(isPrivateAddress("172.16.0.1")).toBe(true);
      expect(isPrivateAddress("172.31.255.255")).toBe(true);
      expect(isPrivateAddress("192.168.1.1")).toBe(true);
      expect(isPrivateAddress("169.254.169.254")).toBe(true);
      expect(isPrivateAddress("100.64.0.1")).toBe(true); // CGNAT
      expect(isPrivateAddress("0.0.0.0")).toBe(true);
      expect(isPrivateAddress("224.0.0.1")).toBe(true); // Multicast
      expect(isPrivateAddress("240.0.0.1")).toBe(true); // Reserved
    });

    it("identifies public IPv4 addresses correctly", () => {
      expect(isPrivateAddress("8.8.8.8")).toBe(false);
      expect(isPrivateAddress("1.1.1.1")).toBe(false);
      expect(isPrivateAddress("104.16.132.229")).toBe(false);
    });

    it("identifies private and loopback IPv6 addresses correctly", () => {
      expect(isPrivateAddress("::1")).toBe(true);
      expect(isPrivateAddress("::")).toBe(true);
      expect(isPrivateAddress("fe80::1")).toBe(true); // link-local
      expect(isPrivateAddress("fc00::1")).toBe(true); // unique-local
      expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true); // IPv4-mapped private
      expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false); // IPv4-mapped public
    });
  });

  describe("assertSafeUrl DNS and hop validation", () => {
    it("rejects loopback and metadata URLs immediately", async () => {
      await expect(assertSafeUrl("http://127.0.0.1:8080/")).rejects.toThrow(BlockedUrlError);
      await expect(assertSafeUrl("http://localhost:3000/")).rejects.toThrow(BlockedUrlError);
      await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(BlockedUrlError);
      await expect(assertSafeUrl("http://10.0.0.1/secret")).rejects.toThrow(BlockedUrlError);
    });

    it("rejects non-http/https protocols", async () => {
      await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow("unsupported protocol");
      await expect(assertSafeUrl("ftp://example.com/test")).rejects.toThrow("unsupported protocol");
    });

    it("rejects URLs with credentials", async () => {
      await expect(assertSafeUrl("http://user:pass@example.com/")).rejects.toThrow("credentials in URL");
    });

    it("enforces allowlist when specified", async () => {
      await expect(
        assertSafeUrl("https://evil.com/x", { allowlist: ["megaplay.buzz"] })
      ).rejects.toThrow("not in allowlist");
    });
  });
});
