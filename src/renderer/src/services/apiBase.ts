import { isDesktopApp } from '../lib/shield'

/** Client for the Zenkai API (Cloudflare Pages Functions in production, Vite middleware in dev). */
export const DEFAULT_API_BASE = 'https://zenkaii.pages.dev'
export const BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (typeof window !== 'undefined' && (window.location.protocol === 'file:' || isDesktopApp()) ? DEFAULT_API_BASE : DEFAULT_API_BASE)

/** Root-relative API paths (e.g. the proxied HLS url) are prefixed with VITE_API_BASE when it is set. */
export const apiUrl = (path: string): string => (path.startsWith('/') ? BASE + path : path)
