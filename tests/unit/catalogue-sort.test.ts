import { describe, expect, it } from 'vitest'
import {
  normalizeCatalogueSort,
  ANIME_SORT_NORMALIZATION_MAP,
} from '../../src/renderer/src/lib/catalogueSort'

describe('Catalogue sort normalization and prototype pollution guard', () => {
  it('normalizes provider-style uppercase sorts to canonical sorts', () => {
    expect(normalizeCatalogueSort('POPULARITY_DESC')).toEqual({
      valid: true,
      sort: 'popularity',
    })
    expect(normalizeCatalogueSort('SCORE_DESC')).toEqual({
      valid: true,
      sort: 'score',
    })
    expect(normalizeCatalogueSort('START_DATE_DESC')).toEqual({
      valid: true,
      sort: 'newest',
    })
    expect(normalizeCatalogueSort('TITLE_ROMAJI')).toEqual({
      valid: true,
      sort: 'title',
    })
    expect(normalizeCatalogueSort('UPDATED_AT_DESC')).toEqual({
      valid: true,
      sort: 'recently-updated',
    })
    expect(normalizeCatalogueSort('ADDED_AT_DESC')).toEqual({
      valid: true,
      sort: 'recently-added',
    })
  })

  it('accepts already-canonical sorts directly', () => {
    expect(normalizeCatalogueSort('popularity')).toEqual({
      valid: true,
      sort: 'popularity',
    })
    expect(normalizeCatalogueSort('score')).toEqual({
      valid: true,
      sort: 'score',
    })
    expect(normalizeCatalogueSort('newest')).toEqual({
      valid: true,
      sort: 'newest',
    })
  })

  it('defaults empty, undefined, or null sort to popularity', () => {
    expect(normalizeCatalogueSort()).toEqual({
      valid: true,
      sort: 'popularity',
    })
    expect(normalizeCatalogueSort('')).toEqual({
      valid: true,
      sort: 'popularity',
    })
    expect(normalizeCatalogueSort(null)).toEqual({
      valid: true,
      sort: 'popularity',
    })
  })

  it('strictly rejects prototype pollution vectors', () => {
    expect(normalizeCatalogueSort('__proto__').valid).toBe(false)
    expect(normalizeCatalogueSort('__proto__').error).toContain('Invalid sort')

    expect(normalizeCatalogueSort('constructor').valid).toBe(false)
    expect(normalizeCatalogueSort('constructor').error).toContain('Invalid sort')

    expect(normalizeCatalogueSort('prototype').valid).toBe(false)
    expect(normalizeCatalogueSort('prototype').error).toContain('Invalid sort')
  })

  it('rejects unsupported TRENDING with structured guidance', () => {
    const res = normalizeCatalogueSort('TRENDING')
    expect(res.valid).toBe(false)
    expect(res.error).toContain('trending sort is only supported via discovery trending section')
  })

  it('rejects arbitrary invalid sort strings', () => {
    const res = normalizeCatalogueSort('malicious_sql_injection')
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Invalid sort')
  })

  it('dictionary has null prototype', () => {
    expect(Object.getPrototypeOf(ANIME_SORT_NORMALIZATION_MAP)).toBeNull()
  })
})
