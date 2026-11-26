/**
 * Catalogue Sort Normalization & Prototype-Pollution Guard.
 *
 * Provides safe normalization of provider-style uppercase sorts (e.g. POPULARITY_DESC)
 * and canonical sorts (e.g. popularity, score), strictly guarding against object
 * prototype pollution (__proto__, constructor, prototype).
 */

export type CanonicalAnimeSort =
  | 'popularity'
  | 'score'
  | 'recently-updated'
  | 'recently-added'
  | 'title'
  | 'newest'

export const CANONICAL_ANIME_SORTS: readonly CanonicalAnimeSort[] = [
  'popularity',
  'score',
  'recently-updated',
  'recently-added',
  'title',
  'newest',
] as const

/**
 * Normalization dictionary created with null prototype to avoid prototype pollution.
 */
export const ANIME_SORT_NORMALIZATION_MAP: Record<string, CanonicalAnimeSort> = Object.assign(
  Object.create(null),
  {
    // Canonical sorts
    popularity: 'popularity',
    score: 'score',
    'recently-updated': 'recently-updated',
    'recently-added': 'recently-added',
    title: 'title',
    newest: 'newest',

    // Provider-style uppercase sorts
    POPULARITY_DESC: 'popularity',
    SCORE_DESC: 'score',
    START_DATE_DESC: 'newest',
    TITLE_ROMAJI: 'title',
    TITLE_ENGLISH: 'title',
    TITLE: 'title',
    UPDATED_AT_DESC: 'recently-updated',
    CREATED_AT_DESC: 'recently-added',
    ADDED_AT_DESC: 'recently-added',
  },
)

export interface SortNormalizationResult {
  valid: boolean
  sort?: CanonicalAnimeSort
  error?: string
}

/**
 * Validates and normalizes any requested catalogue sort string.
 */
export function normalizeCatalogueSort(val?: unknown): SortNormalizationResult {
  if (val === undefined || val === null || val === '') {
    return { valid: true, sort: 'popularity' }
  }

  if (typeof val !== 'string') {
    return { valid: false, error: 'Sort parameter must be a string' }
  }

  const trimmed = val.trim()

  // Guard against prototype pollution keys
  if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
    return { valid: false, error: `Invalid sort: "${trimmed}"` }
  }

  // Reject unsupported TRENDING with structured guidance
  if (trimmed === 'TRENDING' || trimmed === 'TRENDING_DESC' || trimmed === 'trending') {
    return {
      valid: false,
      error: 'trending sort is only supported via discovery trending section',
    }
  }

  // Safe lookup using Object.hasOwn
  if (Object.hasOwn(ANIME_SORT_NORMALIZATION_MAP, trimmed)) {
    return { valid: true, sort: ANIME_SORT_NORMALIZATION_MAP[trimmed] }
  }

  return {
    valid: false,
    error: `Invalid sort: "${trimmed}". Supported sorts: ${CANONICAL_ANIME_SORTS.join(', ')}, POPULARITY_DESC, SCORE_DESC, START_DATE_DESC, TITLE_ROMAJI, UPDATED_AT_DESC, ADDED_AT_DESC`,
  }
}
