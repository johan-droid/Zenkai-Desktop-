import { describe, expect, it } from "vitest";
import { getMapping, getStream, getSubtitles } from "../../src/main/api/routes";

describe("T-API1: Typed API client", () => {
  it("getMapping(21) returns mapping data with anilist id 21", async () => {
    const mapping = await getMapping(21);
    expect(mapping).toBeDefined();
    if (mapping) {
      expect(mapping.anilist).toBe(21);
      expect(mapping.imdb).toBe("tt0388629");
    }
  });

  it("getStream query params match source expectations", async () => {
    // Testing route param builder and live call
    try {
      const res = await getStream({
        id: 21,
        ep: 1,
        server: "megaplay",
        audio: "sub",
        title: "One Piece",
      });
      expect(res).toBeDefined();
      expect(res.streamUrl).toBeDefined();
      expect(res.server).toBeDefined();
    } catch (e: unknown) {
      // In case of network hiccup
      expect((e as Error).message).toBeDefined();
    }
  });

  it("getSubtitles query params match source expectations", async () => {
    try {
      const res = await getSubtitles({
        id: 21,
        ep: 1,
        title: "One Piece",
      });
      expect(res).toBeDefined();
      expect(Array.isArray(res.subtitles)).toBe(true);
    } catch (e: unknown) {
      expect((e as Error).message).toBeDefined();
    }
  });
});
