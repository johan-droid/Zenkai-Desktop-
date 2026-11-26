/** Embed guard: the player refuses to run inside a sandboxed iframe (the host would strip popups, storage and navigation). */

/** Sandbox without allow-same-origin gives the frame an opaque origin. */
export const opaqueOrigin = () => window.origin === 'null'

/** Call inside a user gesture: a sandbox without allow-popups makes window.open return null. */
export function popupsBlocked(): boolean {
  const w = window.open('about:blank', '_blank', 'popup=1,width=1,height=1')
  if (!w) return true
  w.close()
  return false
}

/** ?preview=1 is only honoured for the same-origin docs page, so nobody can use it to skip the guard. */
export function sameOriginParent(): boolean {
  try {
    return window.parent !== window && window.parent.location.origin === location.origin
  } catch {
    return false
  }
}

/**
 * Strict provider origin allowlist for isolated embed streaming.
 * Rejects unverified third-party ad networks, pop-under origins, and malicious redirects.
 */
export const ALLOWED_EMBED_ORIGINS = [
  'cdn.4animo.xyz',
  'flixera.co',
  'zangetsu.cc',
  'megacloud.tv',
  'rapid-cloud.ru',
  'rabbitstream.net',
  'animesalt.cc',
  'animesalt.to',
  'animesalt.cx',
  'animesalt.ro',
  'animesalt.ac',
  'novuscloud.buzz',
  'megaplay.buzz',
  'vidnest.fun',
  'yumezone.qzz.io',
  'videasy.net',
  'vidzee.net',
  'moviebox.ph',
  'movieboxonline.net',
]

export function isAllowedEmbedOrigin(rawUrl?: string): boolean {
  if (!rawUrl) return false
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const hostname = parsed.hostname.toLowerCase()
    return ALLOWED_EMBED_ORIGINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    )
  } catch {
    return false
  }
}

/**
 * Validates that an embed URL is structurally safe:
 * - Scheme must be http or https (no file:, javascript:, data:, blob:)
 * - Host must not be localhost, loopback, or RFC-1918 private subnets
 * - Domain must match the approved provider allowlist
 */
export function isSafeEmbedUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.2') ||
      host.startsWith('172.30.') ||
      host.startsWith('172.31.')
    ) {
      return false
    }
    return isAllowedEmbedOrigin(rawUrl)
  } catch {
    return false
  }
}
