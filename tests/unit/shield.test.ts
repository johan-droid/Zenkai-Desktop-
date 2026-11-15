import { describe, expect, it, beforeEach } from 'vitest'

// Ensure global window exists in test environment
if (typeof (globalThis as unknown as { window: unknown }).window === 'undefined') {
  const fakeWindow = {
    location: { protocol: 'http:', hostname: 'example.com', origin: 'http://example.com', href: 'http://example.com' },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setInterval: () => 0,
    clearInterval: () => {},
  }
  ;(globalThis as unknown as { window: unknown }).window = fakeWindow
  ;(globalThis as unknown as { location: unknown }).location = fakeWindow.location
  ;(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = fakeWindow.sessionStorage
}

import { isDesktopApp, isShieldVerified, getToken, startShield } from '../../src/renderer/src/lib/shield'

describe('Zenkai Shield - Desktop Exemption', () => {
  beforeEach(() => {
    delete (window as unknown as { zenkai?: unknown }).zenkai
    window.location.protocol = 'http:'
    window.location.hostname = 'example.com'
  })

  it('detects desktop app when window.zenkai is present', () => {
    ;(window as unknown as { zenkai: Record<string, unknown> }).zenkai = {
      platform: 'linux',
      versions: { electron: '40.8.0', node: '22.0.0' },
    }
    expect(isDesktopApp()).toBe(true)
  })

  it('detects desktop app when protocol is file:', () => {
    window.location.protocol = 'file:'
    expect(isDesktopApp()).toBe(true)
  })

  it('detects desktop app when hostname is localhost', () => {
    window.location.hostname = 'localhost'
    expect(isDesktopApp()).toBe(true)
  })

  it('isShieldVerified returns true for desktop app without server token', () => {
    ;(window as unknown as { zenkai: Record<string, unknown> }).zenkai = {}
    expect(isShieldVerified()).toBe(true)
  })

  it('getToken resolves to null immediately on desktop without network fetch', async () => {
    ;(window as unknown as { zenkai: Record<string, unknown> }).zenkai = {}
    const token = await getToken()
    expect(token).toBeNull()
  })

  it('startShield sets verified: true on desktop without blocking', () => {
    ;(window as unknown as { zenkai: Record<string, unknown> }).zenkai = {}
    startShield()
    expect(isShieldVerified()).toBe(true)
  })
})
