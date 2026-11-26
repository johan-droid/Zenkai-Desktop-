import { useEffect, useState } from 'react'
import { DESKTOP_REPO, DESKTOP_REPO_URL } from './app'
import pkg from '../../../../package.json'

export interface ChangelogItem {
  badge: string
  title: string
  description: string
}

export interface ReleaseData {
  version: string
  releaseDate: string
  title: string
  tagline: string
  githubUrl: string
  highlights: ChangelogItem[]
}

/** Offline fallback; the real notes come from the latest GitHub release of the desktop repo. */
export const CURRENT_RELEASE: ReleaseData = {
  version: pkg.version,
  releaseDate: 'November 26, 2026',
  title: 'Upstream Web Parity, SSRF DNS Shield & In-App Direct OTA Updater',
  tagline: 'Upstream web parity, SSRF DNS-level resolution guards, offline manga & novel chapter storage, and direct in-app OTA updating.',
  githubUrl: `${DESKTOP_REPO_URL}/releases`,
  highlights: [
    { badge: 'PARITY', title: 'Upstream Web Parity', description: 'Full feature parity with upstream Zenkai, including ranking leaderboards and clean player layouts.' },
    { badge: 'UPDATER', title: 'Direct In-App OTA Updater', description: 'Automatic and direct update downloads within the desktop shell with cryptographic verification.' },
    { badge: 'SECURITY', title: 'SSRF DNS Resolution Guard', description: 'Asynchronous DNS resolution verifying every redirect hop against private, CGNAT, loopback and cloud metadata subnets.' },
    { badge: 'OFFLINE', title: 'Offline Chapter Storage', description: 'Browser IndexedDB chapter caching engine for seamless offline reading of manga and novels.' },
    { badge: 'WEBGPU', title: 'Anime4K WebGPU Upscaler', description: 'Faithful upstream Anime4K WebGPU upscaler with zero custom clutter.' },
  ],
}

/* ---------- latest GitHub release -> ReleaseData ---------- */
export interface GhRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string | null
}
const REPO = DESKTOP_REPO
const CACHE = 'zenkai_desktop_release_cache_v2'
const TTL = 10 * 60 * 1000
const clean = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim()

const trim = (t: string, n = 130) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)
const noEmoji = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, '')

/** Reads either release-body style:
 *  - changelog style: each "### Section" becomes one highlight (title = section, text = its first real bullet)
 *  - short style: first plain line = tagline, "## Heading" = badge, "- **Title** — text" = one highlight */
export function parseRelease(r: GhRelease): ReleaseData {
  const lines = (r.body ?? '').split(/\r?\n/).map((l) => l.trim())
  const sections = lines.some((l) => /^###\s/.test(l))
  let tagline = ''
  let badge = 'NEW'
  const highlights: ChangelogItem[] = []
  for (const line of lines) {
    const h = line.match(/^#{1,6}\s+(.*)/)
    const li = line.match(/^[-*+]\s+(.*)/)
    if (sections) {
      if (/^###\s/.test(line)) highlights.push({ badge: '', title: noEmoji(clean(line.replace(/^#+\s*/, ''))), description: '' })
      else if (li && highlights.length && !highlights[highlights.length - 1].description && !/:\**$/.test(li[1])) highlights[highlights.length - 1].description = trim(clean(li[1]))
    } else if (h) badge = clean(h[1]).toUpperCase()
    else if (li) {
      const b = li[1].match(/^\*\*(.+?)\*\*\s*[—–:-]*\s*(.*)$/)
      const [t, ...d] = b ? [b[1], b[2]] : clean(li[1]).split(/\s[—–-]\s|:\s/)
      highlights.push({ badge, title: clean(t), description: clean(d.join(' ')) })
    } else if (line && !tagline) tagline = clean(line)
  }
  return {
    version: r.tag_name.replace(/^v/i, ''),
    releaseDate: r.published_at ? new Date(r.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
    title: (r.name || r.tag_name).replace(/^.*?v?\d+(\.\d+)+\s*[-–—:]\s*/i, ''),
    tagline,
    githubUrl: r.html_url,
    highlights: highlights.slice(0, 8),
  }
}

let latest: Promise<ReleaseData> | undefined
/** Latest published release of the desktop repo (cached 10 min in localStorage); the static fallback when GitHub is unreachable. */
export function fetchLatestRelease(): Promise<ReleaseData> {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as { at: number; v: ReleaseData } | null
    if (c && Date.now() - c.at < TTL && c.v?.version) return (latest = Promise.resolve(c.v))
  } catch {}
  return (latest ??= fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? (r.json() as Promise<GhRelease>) : Promise.reject(r.status)))
    .then((g) => {
      const v = parseRelease(g)
      if (!v.highlights.length && !v.tagline && !v.version) throw 0
      try {
        localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), v }))
      } catch {}
      return v
    })
    .catch(() => CURRENT_RELEASE))
}

export function useRelease(): { release: ReleaseData; ready: boolean } {
  const [s, set] = useState({ release: CURRENT_RELEASE, ready: false })
  useEffect(() => {
    let off = false
    // Synchronize with Electron native app version if available
    if (typeof window !== 'undefined' && window.zenkai?.app?.version) {
      window.zenkai.app.version().then((v) => {
        if (!off && v) {
          set((prev) => ({
            ...prev,
            release: { ...prev.release, version: v },
          }))
        }
      }).catch(() => {})
    }
    void fetchLatestRelease().then((release) => !off && set({ release, ready: true }))
    return () => {
      off = true
    }
  }, [])
  return s
}

const STORAGE_KEY = 'zenkai_release_seen_version'
const EVENT_NAME = 'zenkai:changelog-toggle'

export function hasSeenLatestRelease(version = CURRENT_RELEASE.version): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) === version
  } catch {
    return true
  }
}

export function markReleaseSeen(version = CURRENT_RELEASE.version): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {}
}

export function openChangelog(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { open: true } }))
}

export function closeChangelog(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { open: false } }))
}

export function onChangelogToggle(callback: (open: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{ open?: boolean }>
    callback(Boolean(custom.detail?.open))
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}

