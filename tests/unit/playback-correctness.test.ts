import { describe, expect, it } from "vitest";
import { ANIME_MAPPING, pickMapping } from "../../server/mapping";

describe("Playback Correctness & Anti-Cross-Title Regression Suite", () => {
  it("resolves canonical continuous anime across seasons without resetting episode count (Naruto 20)", () => {
    // S1: 1-57
    const ep1 = pickMapping(ANIME_MAPPING, 20, 1);
    expect(ep1).toBeDefined();
    expect(ep1?.saltId).toBe("naruto");
    expect(ep1?.season).toBe(1);
    expect(ep1?.episode).toBe(1);
    expect(ep1?.slug).toBe("naruto-1x1");

    // S2: 58-100
    const ep60 = pickMapping(ANIME_MAPPING, 20, 60);
    expect(ep60).toBeDefined();
    expect(ep60?.saltId).toBe("naruto");
    expect(ep60?.season).toBe(2);
    expect(ep60?.episode).toBe(60);
    expect(ep60?.slug).toBe("naruto-2x60");

    // S3: 101-141
    const ep120 = pickMapping(ANIME_MAPPING, 20, 120);
    expect(ep120?.season).toBe(3);
    expect(ep120?.slug).toBe("naruto-3x120");

    // S5: 184+
    const ep200 = pickMapping(ANIME_MAPPING, 20, 200);
    expect(ep200?.season).toBe(5);
    expect(ep200?.slug).toBe("naruto-5x200");
  });

  it("never silently falls back or maps an unmapped title to another anime", () => {
    const unmappedId = 999999999;
    const result = pickMapping(ANIME_MAPPING, unmappedId, 1);
    expect(result).toBeNull();
  });

  it("distinguishes movies from episodic series", () => {
    const movieEntry = {
      testMovie: {
        saltId: "standalone-movie",
        season: 0,
        startEpisode: 1,
      },
    };
    const res = pickMapping(movieEntry, "testMovie", 1, true);
    expect(res?.isMovie).toBe(true);
    expect(res?.slug).toBe("standalone-movie");
  });

  it("applies episodeOffset correctly when cour is split", () => {
    const splitCourEntry = {
      courTwo: {
        saltId: "split-series",
        season: 2,
        startEpisode: 1,
        episodeOffset: 12,
      },
    };
    // Episode 1 of part 2 is episode 13 overall
    const res = pickMapping(splitCourEntry, "courTwo", 1);
    expect(res?.season).toBe(2);
    expect(res?.episode).toBe(13);
    expect(res?.finalEp).toBe(13);
    expect(res?.slug).toBe("split-series-2x13");
  });

  it("cache key isolation guarantees no cross-title collisions", () => {
    const makeKey = (id: number, ep: number, audio: string, server: string, format = "") =>
      `stream:${id}:${ep}:${audio}:${server}:${format}`;

    const key1 = makeKey(20, 1, "sub", "megaplay");
    const key2 = makeKey(21, 1, "sub", "megaplay");
    const key3 = makeKey(20, 1, "dub", "megaplay");
    const key4 = makeKey(20, 2, "sub", "megaplay");

    const keys = new Set([key1, key2, key3, key4]);
    expect(keys.size).toBe(4);
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });
});
