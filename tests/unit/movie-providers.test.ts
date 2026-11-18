import { describe, expect, it } from "vitest";
import {
  listProviders,
  providerUrl,
} from "../../src/renderer/src/lib/providers";

const DEAD = [
  "cinemaos",
  "videasy",
  "vidup",
  "vidcore",
  "vidsrc-ru",
  "vidlove",
  "1embed",
];

describe("movie/TV provider list", () => {
  it("defaults to a provider that actually plays", () => {
    expect(listProviders("movie")[0]?.id).toBe("moviebox");
    expect(listProviders("tv")[0]?.id).toBe("moviebox");
  });

  it("hides unreachable embed hosts", () => {
    const ids = listProviders("movie").map((p) => p.id);
    for (const dead of DEAD) expect(ids).not.toContain(dead);
    expect(ids).toContain("cinesrc");
  });

  it("keeps anime providers untouched", () => {
    const ids = listProviders("anime").map((p) => p.id);
    expect(ids).toContain("cinemaos");
    expect(ids).toContain("megaplay-sub");
  });

  it("builds vidsrc.su urls for movie and tv", () => {
    expect(providerUrl("vidsrc-su", "movie", 550, 1, 1)).toBe(
      "https://vidsrc.su/embed/movie/550",
    );
    expect(providerUrl("vidsrc-su", "tv", 1399, 1, 2)).toBe(
      "https://vidsrc.su/embed/tv/1399/1/2",
    );
  });
});
