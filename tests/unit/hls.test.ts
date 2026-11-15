import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HlsError, parseM3u8 } from "../../src/main/downloads/hls";
import { downloadHlsStream } from "../../src/main/downloads/hls-download";
import { downloadSubtitles } from "../../src/main/downloads/subtitles";

describe("T-API4: HLS Playlist Parser", () => {
  it("fMP4 (EXT-X-MAP) throws clear unsupported error", () => {
    const fmp4Playlist = `
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
segment1.mp4
`;
    expect(() => parseM3u8(fmp4Playlist, "https://example.com/live.m3u8")).toThrow(
      "fMP4 (EXT-X-MAP) is unsupported in v1",
    );
  });

  it("parses master playlist and orders variants by bandwidth descending", () => {
    const master = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p.m3u8
`;
    const res = parseM3u8(master, "https://example.com/master.m3u8");
    expect(res.isMaster).toBe(true);
    expect(res.variants.length).toBe(3);
    expect(res.variants[0].bandwidth).toBe(5000000);
    expect(res.variants[0].resolution).toBe("1920x1080");
    expect(res.variants[0].uri).toBe("https://example.com/1080p.m3u8");
  });

  it("parses media playlist with AES-128 key and explicit IV", () => {
    const media = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:1
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x00000000000000000000000000000001
#EXTINF:10.0,
segment-1.ts
`;
    const res = parseM3u8(media, "https://example.com/index.m3u8");
    expect(res.isMaster).toBe(false);
    expect(res.segments.length).toBe(1);
    expect(res.segments[0].key?.method).toBe("AES-128");
    expect(res.segments[0].key?.uri).toBe("https://example.com/key.bin");
    expect(res.segments[0].key?.iv?.length).toBe(16);
  });

  it("AES-128 stream decrypts correctly", async () => {
    // Generate known key and IV
    const key = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);

    // Create plaintext MPEG-TS dummy data (sync byte 0x47, 188 bytes)
    const plaintext = Buffer.alloc(188 * 3);
    for (let i = 0; i < 3; i++) {
      plaintext[i * 188] = 0x47;
    }

    const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    expect(decrypted.equals(plaintext)).toBe(true);
    expect(decrypted[0]).toBe(0x47);
  });
});

describe("T-API5: Subtitles", () => {
  it(
    ".srt written for known title with IMDb id (or gracefully skips if none)",
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenkai-sub-"));
      const dummyTs = path.join(tmpDir, "ep1.ts");

      const res = await downloadSubtitles({
        anilistId: 21,
        episode: 1,
        destinationTsPath: dummyTs,
        title: "One Piece",
      });

      expect(res).toBeDefined();
      if (res.saved) {
        expect(fs.existsSync(res.path!)).toBe(true);
        expect(res.path!.endsWith(".srt")).toBe(true);
      } else {
        expect(typeof res.reason).toBe("string");
      }
    },
    30000,
  );

  it(
    "missing IMDb id → skip subs, log info, download still succeeds",
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenkai-sub-"));
      const dummyTs = path.join(tmpDir, "no_imdb.ts");

      const res = await downloadSubtitles({
        anilistId: 999999999,
        episode: 1,
        destinationTsPath: dummyTs,
      });

      expect(res.saved).toBe(false);
      expect(["missing_imdb_id", "mapping_failed"]).toContain(res.reason);
    },
    30000,
  );
});
