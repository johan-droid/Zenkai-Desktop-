export const ANIME_MAPPING: Record<string, any>;

export interface PickedMapping {
  saltId: string;
  season: number;
  episode: number;
  finalEp: number;
  isMovie: boolean;
  slug: string;
}

export function pickMapping(
  mapping: Record<string, any>,
  anilistId: string | number,
  episode?: number,
  isMovie?: boolean,
): PickedMapping | null;
