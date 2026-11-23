import { describe, expect, it, beforeEach } from 'vitest'

const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size
  },
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
}
;(globalThis as any).localStorage = mockLocalStorage

const sessionStore = new Map<string, string>()
const mockSessionStorage = {
  getItem: (key: string) => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStore.set(key, String(value)),
  removeItem: (key: string) => sessionStore.delete(key),
  clear: () => sessionStore.clear(),
  get length() {
    return sessionStore.size
  },
  key: (i: number) => Array.from(sessionStore.keys())[i] ?? null,
}
;(globalThis as any).sessionStorage = mockSessionStorage

if (typeof (globalThis as any).window === 'undefined') {
  ;(globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
  }
} else {
  ;(globalThis as any).window.setTimeout = globalThis.setTimeout.bind(globalThis)
  ;(globalThis as any).window.clearTimeout = globalThis.clearTimeout.bind(globalThis)
}

import {
  awardMessageXp,
  autoClaimQuests,
  recordProgressionActivity,
  getAscensionState,
  checkAchievements,
  clearAscensionCache,
} from '../../src/renderer/src/lib/ascension/ascensionStore'

describe('Ascension Progression & XP System', () => {
  beforeEach(() => {
    storage.clear()
    sessionStore.clear()
    clearAscensionCache()
  })

  it('awards +5 XP for valid chat messages up to 10 per day', async () => {
    const initialXp = getAscensionState().totalXp

    // First message awards 5 XP
    await awardMessageXp('msg-001', 'Hello everyone!')
    expect(getAscensionState().totalXp).toBe(initialXp + 5)

    // Same message ID does not double-award (client idempotency)
    await awardMessageXp('msg-001', 'Hello everyone!')
    expect(getAscensionState().totalXp).toBe(initialXp + 5)

    // Too short message (< 3 characters) is not awarded
    await awardMessageXp('msg-002', 'hi')
    expect(getAscensionState().totalXp).toBe(initialXp + 5)

    // Rapid successive messages up to daily cap
    for (let i = 2; i <= 10; i++) {
      await awardMessageXp(`msg-${i}`, `Message number ${i} in chat`)
    }
    expect(getAscensionState().totalXp).toBe(initialXp + 50)

    // 11th message should be capped (max 10 / day)
    await awardMessageXp('msg-11', 'Eleven is over the cap')
    expect(getAscensionState().totalXp).toBe(initialXp + 50)
  })

  it('records progression activity for watch_movie (75 XP)', async () => {
    const startXp = getAscensionState().totalXp
    await recordProgressionActivity({
      action: 'watch_movie',
      xp: 75,
      refId: 'tmdb_movie_550',
    })

    const afterXp = getAscensionState().totalXp
    expect(afterXp).toBeGreaterThanOrEqual(startXp + 75)
  })

  it('autoClaimQuests safely processes completed quests without crash', () => {
    expect(() => autoClaimQuests()).not.toThrow()
  })

  it('checkAchievements supports silent evaluations', async () => {
    const state = getAscensionState()
    await expect(checkAchievements(state, true)).resolves.not.toThrow()
  })
})
