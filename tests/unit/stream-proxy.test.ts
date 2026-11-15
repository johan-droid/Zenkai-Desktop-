import { describe, expect, it } from "vitest";
import {
  ProxyHostDenied,
  ProxyProtocolDenied,
  fetchViaProxy,
} from "../../src/main/api/proxy";
import { resolveStream } from "../../src/main/api/stream";

describe("T-API2: Stream resolver", () => {
  it("ACDN with audio: 'sub' throws", async () => {
    await expect(
      resolveStream({
        anilistId: 21,
        episode: 1,
        audio: "sub",
        server: "acdn",
      }),
    ).rejects.toThrow("ACDN server is only valid when audio is 'dub'");
  });

  it("Returns m3u8 for known sub id (One Piece, ep 1)", async () => {
    const res = await resolveStream({
      anilistId: 21,
      episode: 1,
      audio: "sub",
      server: "megaplay",
      title: "One Piece",
    });
    expect(res).toBeDefined();
    expect(res.m3uUrl).toMatch(/\.m3u8/);
    expect(res.allowedHosts.length).toBeGreaterThan(0);
  });

  it("Returns m3u8 for known dub id (One Piece, ep 1)", async () => {
    const res = await resolveStream({
      anilistId: 21,
      episode: 1,
      audio: "dub",
      server: "megaplay",
      title: "One Piece",
    });
    expect(res).toBeDefined();
    expect(res.m3uUrl).toMatch(/\.m3u8/);
    expect(res.allowedHosts.length).toBeGreaterThan(0);
  });
});

describe("T-API3: Proxy fetcher (guarded)", () => {
  it("Unit test: non-allowlisted host → throws ProxyHostDenied", async () => {
    await expect(
      fetchViaProxy("https://evil.com/video.ts", ["trusted.com", "cdn.com"]),
    ).rejects.toThrow(ProxyHostDenied);
  });

  it("Unit test: http: URL → throws ProxyProtocolDenied", async () => {
    await expect(
      fetchViaProxy("http://trusted.com/video.ts", ["trusted.com"]),
    ).rejects.toThrow(ProxyProtocolDenied);
  });

  it("Live: fetch one segment via proxy → 200 with segment bytes", async () => {
    const stream = await resolveStream({
      anilistId: 21,
      episode: 1,
      audio: "sub",
      server: "megaplay",
      title: "One Piece",
    });

    const parsedM3u = new URL(stream.m3uUrl);
    const allowed = [...stream.allowedHosts, parsedM3u.hostname];

    // Fetch master playlist
    const masterRes = await fetchViaProxy(stream.m3uUrl, allowed, stream.referer);
    expect(masterRes.status).toBe(200);
    const masterText = await masterRes.text();
    expect(masterText).toContain("#EXTM3U");

    // Extract variant or first segment
    const lines = masterText.split("\n").map((l) => l.trim());
    let variantUrl = lines.find(
      (l) => l && !l.startsWith("#") && (l.includes(".m3u8") || l.includes("index")),
    );
    if (variantUrl && !variantUrl.startsWith("http")) {
      variantUrl = new URL(variantUrl, stream.m3uUrl).href;
    }

    if (variantUrl) {
      const variantHost = new URL(variantUrl).hostname;
      if (!allowed.includes(variantHost)) allowed.push(variantHost);

      const varRes = await fetchViaProxy(variantUrl, allowed, stream.referer);
      expect(varRes.status).toBe(200);
      const varText = await varRes.text();
      const varLines = varText.split("\n").map((l) => l.trim());
      let segUrl = varLines.find((l) => l && !l.startsWith("#"));
      if (segUrl && !segUrl.startsWith("http")) {
        segUrl = new URL(segUrl, variantUrl).href;
      }

      if (segUrl) {
        let realSegUrl = segUrl;
        try {
          const u = new URL(segUrl);
          if (u.searchParams.has("url")) {
            realSegUrl = u.searchParams.get("url")!;
          }
        } catch {}
        const segHost = new URL(realSegUrl).hostname;
        if (!allowed.includes(segHost)) allowed.push(segHost);

        const segRes = await fetchViaProxy(realSegUrl, allowed, stream.referer);
        expect(segRes.status).toBe(200);
        const buf = Buffer.from(await segRes.arrayBuffer());
        expect(buf.length).toBeGreaterThan(0);
        // MPEG-TS packets begin with 0x47
        expect(buf[0]).toBe(0x47);
      }
    }
  }, 30000);
});
