export interface EpisodeInfo {
  n: number;
  name: string | null;
  overview: string | null;
  image: string | null;
  runtime: number | null;
  air: string | null;
}

/**
 * Parses raw AniList streaming episode title strings
 * e.g. "Episode 12 - The Reckoning" -> { n: 12, name: "The Reckoning" }
 */
export function parseAniListEpisodeTitle(
  rawTitle: string,
  fallbackIndex = 1,
): { n: number; name: string } {
  if (!rawTitle) return { n: fallbackIndex, name: `Episode ${fallbackIndex}` };

  const match = /^Episode\s+(\d+)(?:\s*-\s*(.+))?$/i.exec(rawTitle.trim());
  if (match) {
    const n = Number(match[1]);
    const name = match[2]?.trim() || `Episode ${n}`;
    return { n, name };
  }

  return { n: fallbackIndex, name: rawTitle.trim() };
}

/**
 * Merges episode metadata from TMDB and AniList.
 * Rule: TMDB wins whenever it has a value for a field; AniList fills in anything missing.
 */
export function mergeEpisodeSources(
  tmdb: Partial<EpisodeInfo>[],
  anilist: Partial<EpisodeInfo>[],
): Map<number, EpisodeInfo> {
  const merged = new Map<number, EpisodeInfo>();

  // 1. Populate AniList baseline
  for (const a of anilist) {
    if (typeof a.n !== "number") continue;
    merged.set(a.n, {
      n: a.n,
      name: a.name ?? null,
      overview: a.overview ?? null,
      image: a.image ?? null,
      runtime: a.runtime ?? null,
      air: a.air ?? null,
    });
  }

  // 2. Overlay TMDB (TMDB-priority for present fields)
  for (const t of tmdb) {
    if (typeof t.n !== "number") continue;
    const existing = merged.get(t.n);
    merged.set(t.n, {
      n: t.n,
      name: t.name ?? existing?.name ?? null,
      overview: t.overview ?? existing?.overview ?? null,
      image: t.image ?? existing?.image ?? null,
      runtime: t.runtime ?? existing?.runtime ?? null,
      air: t.air ?? existing?.air ?? null,
    });
  }

  return merged;
}
