import { describe, expect, it } from 'vitest'
import { episodeCounts, anilistEpisodes } from '../../src/renderer/src/lib/episodes'

describe('Episode Counts & Early Leaks Engine', () => {
  it('correctly handles regular airing series', () => {
    const regular = episodeCounts({
      format: 'TV',
      status: 'RELEASING',
      episodes: 24,
      nextAiringEpisode: { episode: 12 },
    })
    expect(regular.available).toBe(11)
    expect(regular.total).toBe(24)
  })

  it('correctly handles completed series', () => {
    const finished = episodeCounts({
      format: 'TV',
      status: 'FINISHED',
      episodes: 12,
      nextAiringEpisode: null,
    })
    expect(finished.available).toBe(12)
    expect(finished.total).toBe(12)
  })

  it('correctly handles movies', () => {
    const movieReleased = episodeCounts({
      format: 'MOVIE',
      status: 'FINISHED',
      episodes: 1,
      nextAiringEpisode: null,
    })
    expect(movieReleased.available).toBe(1)
    expect(movieReleased.total).toBe(1)

    const movieUnreleased = episodeCounts({
      format: 'MOVIE',
      status: 'NOT_YET_RELEASED',
      episodes: 1,
      nextAiringEpisode: null,
    })
    expect(movieUnreleased.available).toBe(0)
    expect(movieUnreleased.total).toBe(1)
  })

  it('applies early release override for designated series before expiry', () => {
    // 195604 = Black Clover Season 2, early episode 9 override until end of Nov 2026
    const earlyAnime = episodeCounts({
      id: 195604,
      format: 'TV',
      status: 'RELEASING',
      episodes: 12,
      nextAiringEpisode: { episode: 8 }, // AniList thinks episode 7 aired
    })
    expect(earlyAnime.available).toBe(9) // Overridden to 9
    expect(earlyAnime.total).toBe(12)
  })

  it('parses AniList streaming episode title strings correctly', () => {
    const list = anilistEpisodes([
      { title: 'Episode 1 - The Chosen Path', thumbnail: 'https://example.com/ep1.jpg' },
      { title: 'Ep 2: The Next Horizon', thumbnail: 'https://example.com/ep2.jpg' },
      { title: 'NonMatchingTitle', thumbnail: 'https://example.com/ep3.jpg' },
    ])

    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({
      n: 1,
      name: 'The Chosen Path',
      overview: null,
      image: 'https://example.com/ep1.jpg',
      runtime: null,
      air: null,
    })
    expect(list[1]).toEqual({
      n: 2,
      name: 'The Next Horizon',
      overview: null,
      image: 'https://example.com/ep2.jpg',
      runtime: null,
      air: null,
    })
  })
})
