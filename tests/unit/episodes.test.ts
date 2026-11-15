import { describe, expect, it } from "vitest";
import {
  mergeEpisodeSources,
  parseAniListEpisodeTitle,
  type EpisodeInfo,
} from "../../src/shared/episodes";

describe("T-API11: Episode Metadata Merge Engine", () => {
  it("parses AniList episode title strings", () => {
    expect(parseAniListEpisodeTitle("Episode 12 - The Reckoning")).toEqual({
      n: 12,
      name: "The Reckoning",
    });
    expect(parseAniListEpisodeTitle("Episode 5")).toEqual({
      n: 5,
      name: "Episode 5",
    });
    expect(parseAniListEpisodeTitle("Prologue", 1)).toEqual({
      n: 1,
      name: "Prologue",
    });
  });

  it("merges metadata with TMDB-wins rule and AniList-fallback", () => {
    const anilist: Partial<EpisodeInfo>[] = [
      {
        n: 1,
        name: "AniList Title Ep 1",
        overview: "AniList Overview",
        image: "https://anilist.co/img1.jpg",
      },
      {
        n: 2,
        name: "AniList Title Ep 2",
        overview: "AniList Overview 2",
      },
    ];

    const tmdb: Partial<EpisodeInfo>[] = [
      {
        n: 1,
        name: "TMDB Definitive Title Ep 1", // TMDB wins
        overview: "TMDB Rich Synopsis", // TMDB wins
        image: null, // TMDB missing, AniList should fill
        runtime: 24, // TMDB unique field
      },
    ];

    const merged = mergeEpisodeSources(tmdb, anilist);

    const ep1 = merged.get(1);
    expect(ep1).toBeDefined();
    expect(ep1?.name).toBe("TMDB Definitive Title Ep 1");
    expect(ep1?.overview).toBe("TMDB Rich Synopsis");
    expect(ep1?.image).toBe("https://anilist.co/img1.jpg"); // Filled from AniList
    expect(ep1?.runtime).toBe(24);

    const ep2 = merged.get(2);
    expect(ep2).toBeDefined();
    expect(ep2?.name).toBe("AniList Title Ep 2");
    expect(ep2?.overview).toBe("AniList Overview 2");
    expect(ep2?.image).toBeNull();
  });
});
