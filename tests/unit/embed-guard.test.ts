import { describe, expect, it } from 'vitest'
import { isAllowedEmbedOrigin, isSafeEmbedUrl, ALLOWED_EMBED_ORIGINS } from '../../src/renderer/src/lib/embedGuard'

describe('Embed player origin allowlisting & security guard', () => {
  it('allows approved embed origins', () => {
    expect(isAllowedEmbedOrigin('https://megaplay.buzz/stream/ani/1/1/sub')).toBe(true)
    expect(isAllowedEmbedOrigin('https://embed.megaplay.buzz/v/123')).toBe(true)
    expect(isAllowedEmbedOrigin('https://vidnest.fun/anime/21/1/sub')).toBe(true)
    expect(isAllowedEmbedOrigin('https://animesalt.cx/player/123')).toBe(true)
  })

  it('rejects unverified and ad-network origins', () => {
    expect(isAllowedEmbedOrigin('https://evil-popups.com/embed')).toBe(false)
    expect(isAllowedEmbedOrigin('https://malicious-ads.net/stream')).toBe(false)
    expect(isAllowedEmbedOrigin('https://randomcdn.xyz/video')).toBe(false)
    expect(isAllowedEmbedOrigin('')).toBe(false)
    expect(isAllowedEmbedOrigin(undefined)).toBe(false)
  })

  it('isSafeEmbedUrl rejects private network and loopback targets', () => {
    expect(isSafeEmbedUrl('http://localhost:8080/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://127.0.0.1:3000/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://0.0.0.0/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://192.168.1.1/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://10.0.0.1/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://172.16.0.1/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://app.local/embed')).toBe(false)
    expect(isSafeEmbedUrl('http://service.internal/embed')).toBe(false)
  })

  it('isSafeEmbedUrl rejects dangerous protocols', () => {
    expect(isSafeEmbedUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeEmbedUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeEmbedUrl('file:///etc/passwd')).toBe(false)
  })

  it('isSafeEmbedUrl approves valid, safe embed streams', () => {
    expect(isSafeEmbedUrl('https://megaplay.buzz/stream/ani/21/1/sub')).toBe(true)
    expect(isSafeEmbedUrl('https://yumezone.qzz.io/embed/megaplay/ani/21/1/sub')).toBe(true)
  })
})
