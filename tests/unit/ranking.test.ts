import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchLeaderboard } from '../../src/renderer/src/lib/ranking'

describe('Ranking & Leaderboard Cache Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns array when Supabase returns error or empty', async () => {
    const rows = await fetchLeaderboard()
    // Supabase in test environment is unconfigured / offline, so it returns [] gracefully
    expect(Array.isArray(rows)).toBe(true)
  }, 15000)

  it('caches results within TTL window', async () => {
    const first = await fetchLeaderboard()
    const second = await fetchLeaderboard()
    expect(first).toBe(second) // exact same object reference from in-memory cache
  }, 15000)
})
