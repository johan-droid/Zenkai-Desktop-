import { memo, useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Search,
  Download,
  Settings,
  Maximize2,
  Minimize2,
  Tv,
  House,
  Clapperboard,
  BookOpen,
  Book,
  Archive,
  Sparkles,
  CalendarDays,
  User,
  type LucideIcon,
} from 'lucide-react'
import { useDesktopNavigation } from '../hooks/useDesktopNavigation'
import { useSearch } from '../context/SearchContext'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '../lib/utils'

interface BreadcrumbItem {
  label: string
  to?: string
  icon?: LucideIcon
}

function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  if (pathname === '/' || pathname === '/home') {
    return [{ label: 'Home', icon: House }]
  }
  if (pathname.startsWith('/browse') || pathname === '/trending' || pathname === '/popular' || pathname === '/top') {
    return [
      { label: 'Anime', to: '/home', icon: House },
      { label: pathname === '/trending' ? 'Trending' : pathname === '/popular' ? 'Popular' : pathname === '/top' ? 'Top Rated' : 'Browse' },
    ]
  }
  if (pathname.startsWith('/anime/') || pathname.startsWith('/details/') || pathname.startsWith('/mal/')) {
    const id = pathname.split('/')[2]
    return [
      { label: 'Anime', to: '/home', icon: House },
      { label: 'Details', to: `/anime/${id}` },
    ]
  }
  if (pathname.startsWith('/watch/')) {
    const id = pathname.split('/')[2]
    return [
      { label: 'Anime', to: '/home', icon: House },
      { label: 'Details', to: `/anime/${id}` },
      { label: 'Player' },
    ]
  }
  if (pathname === '/movies') {
    return [{ label: 'Movies & TV', icon: Clapperboard }]
  }
  if (pathname.startsWith('/movies/browse')) {
    return [
      { label: 'Movies & TV', to: '/movies', icon: Clapperboard },
      { label: 'Browse' },
    ]
  }
  if (pathname.startsWith('/movies/watch/')) {
    const parts = pathname.split('/')
    const type = parts[3]
    const id = parts[4]
    return [
      { label: 'Movies & TV', to: '/movies', icon: Clapperboard },
      { label: 'Details', to: `/movies/${type}/${id}` },
      { label: 'Player' },
    ]
  }
  if (pathname.startsWith('/movies/')) {
    const parts = pathname.split('/')
    const type = parts[2]
    const id = parts[3]
    return [
      { label: 'Movies & TV', to: '/movies', icon: Clapperboard },
      { label: type === 'tv' ? 'Series' : 'Movie', to: `/movies/${type}/${id}` },
    ]
  }
  if (pathname === '/manga') {
    return [{ label: 'Manga', icon: BookOpen }]
  }
  if (pathname.startsWith('/manga/browse')) {
    return [
      { label: 'Manga', to: '/manga', icon: BookOpen },
      { label: 'Browse' },
    ]
  }
  if (pathname.startsWith('/manga/') && pathname.includes('/read/')) {
    const parts = pathname.split('/')
    const id = parts[2]
    return [
      { label: 'Manga', to: '/manga', icon: BookOpen },
      { label: 'Details', to: `/manga/${id}` },
      { label: 'Reader' },
    ]
  }
  if (pathname.startsWith('/manga/')) {
    const id = pathname.split('/')[2]
    return [
      { label: 'Manga', to: '/manga', icon: BookOpen },
      { label: 'Details', to: `/manga/${id}` },
    ]
  }
  if (pathname === '/novel') {
    return [{ label: 'Light Novels', icon: Book }]
  }
  if (pathname.startsWith('/novel/') && pathname.includes('/read/')) {
    const parts = pathname.split('/')
    const source = parts[2]
    const slug = parts[3]
    return [
      { label: 'Light Novels', to: '/novel', icon: Book },
      { label: 'Details', to: `/novel/${source}/${slug}` },
      { label: 'Reader' },
    ]
  }
  if (pathname.startsWith('/novel/')) {
    const parts = pathname.split('/')
    const source = parts[2]
    const slug = parts[3]
    return [
      { label: 'Light Novels', to: '/novel', icon: Book },
      { label: 'Details', to: `/novel/${source}/${slug}` },
    ]
  }
  if (pathname.startsWith('/downloads')) {
    return [{ label: 'Offline Downloads', icon: Download }]
  }
  if (pathname.startsWith('/list')) {
    return [{ label: 'My Library', icon: Archive }]
  }
  if (pathname.startsWith('/schedule')) {
    return [{ label: 'Airing Schedule', icon: CalendarDays }]
  }
  if (pathname.startsWith('/vision')) {
    return [{ label: 'Vision Studio AI', icon: Sparkles }]
  }
  if (pathname.startsWith('/settings')) {
    return [{ label: 'Settings & Preferences', icon: Settings }]
  }
  if (pathname.startsWith('/profile') || pathname.startsWith('/u/')) {
    return [{ label: 'Profile', icon: User }]
  }
  if (pathname.startsWith('/watchparty') || pathname.startsWith('/watchtogether')) {
    return [{ label: 'WatchParty', icon: Tv }]
  }

  // Fallback
  return [{ label: 'Zenkai' }]
}

export const DesktopHeader = memo(function DesktopHeader() {
  const { pathname } = useLocation()
  const { canGoBack, canGoForward, goBack, goForward, reload } = useDesktopNavigation()
  const { openSearch } = useSearch()

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [isFullscreen, setIsFullscreen] = useState(() => (typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false))
  const [activeDownloads, setActiveDownloads] = useState(0)
  const [reloading, setReloading] = useState(false)

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)
  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname])

  // Track online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Track fullscreen status
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Poll active downloads
  useEffect(() => {
    if (typeof window === 'undefined' || !window.zenkai?.downloads) return
    const update = () => {
      window.zenkai.downloads.list().then((items) => {
        const count = (items || []).filter((i) => i.status === 'active' || i.status === 'queued').length
        setActiveDownloads(count)
      }).catch(() => {})
    }
    update()
    const t = window.setInterval(update, 3000)
    return () => window.clearInterval(t)
  }, [])

  const handleReload = () => {
    setReloading(true)
    reload()
    window.setTimeout(() => setReloading(false), 800)
  }

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {})
    } else {
      void document.exitFullscreen().catch(() => {})
    }
  }

  const iconBtn = 'grid place-items-center size-8 rounded-lg text-muted hover:text-foreground hover:bg-foreground/[0.06] transition-all active:scale-95 disabled:opacity-25 disabled:pointer-events-none'

  return (
    <header
      className="sticky top-0 z-40 hidden md:flex h-14 w-full items-center justify-between border-b border-border/40 bg-background/85 px-4 backdrop-blur-2xl select-none transition-colors duration-200 before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/25 before:to-transparent"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 1. Left: Navigation History Controls & Breadcrumbs */}
      <div className="flex items-center gap-3 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-0.5 rounded-xl bg-foreground/[0.03] border border-border/40 p-0.5 shadow-xs">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            title="Go Back (Alt + ← / Mouse 4)"
            className={iconBtn}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={!canGoForward}
            title="Go Forward (Alt + → / Mouse 5)"
            className={iconBtn}
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleReload}
            title="Reload (Ctrl + R)"
            className={iconBtn}
          >
            <RotateCw className={cn('size-3.5', reloading && 'animate-spin text-accent')} />
          </button>
        </div>

        {/* Location Breadcrumb Trail */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1
            const Icon = crumb.icon
            return (
              <div key={crumb.label + idx} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="size-3 text-muted/30 shrink-0" />}
                {crumb.to && !isLast ? (
                  <Link
                    to={crumb.to}
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    {Icon && <Icon className="size-3.5 shrink-0 text-accent" />}
                    <span className="truncate max-w-[140px]">{crumb.label}</span>
                  </Link>
                ) : (
                  <span className={cn('inline-flex items-center gap-1.5', isLast && 'text-foreground font-semibold')}>
                    {Icon && <Icon className="size-3.5 shrink-0 text-accent" />}
                    <span className="truncate max-w-[180px]">{crumb.label}</span>
                  </span>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      {/* 2. Center: Sleek Spotlight Omni-Search Bar */}
      <div className="flex items-center justify-center flex-1 max-w-lg px-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => openSearch()}
          className="group relative flex h-9 w-full items-center gap-2.5 rounded-full border border-border/50 bg-foreground/[0.03] px-3.5 text-xs text-muted shadow-2xs transition-all hover:border-accent/40 hover:bg-foreground/[0.06] hover:text-foreground hover:shadow-xs active:scale-[0.99]"
        >
          <Search className="size-3.5 text-muted/70 transition-colors group-hover:text-accent" />
          <span className="truncate text-left font-normal flex-1 text-muted/80 group-hover:text-foreground">
            Search anime, movies, manga...
          </span>
          <kbd className="inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted shadow-2xs">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>

      {/* 3. Right: Quick Actions (Downloads, WatchParty, Fullscreen, Appearance, Settings, Online) */}
      <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Offline Downloads Quick Access */}
        <Link
          to="/downloads"
          title={activeDownloads > 0 ? `${activeDownloads} downloads active` : 'Offline Downloads'}
          className={cn(iconBtn, 'relative')}
        >
          <Download className="size-4" />
          {activeDownloads > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-fg shadow-sm animate-pulse">
              {activeDownloads}
            </span>
          )}
        </Link>

        {/* WatchParty Shortcut */}
        <Link
          to="/watchparty"
          title="WatchParty"
          className={iconBtn}
        >
          <Tv className="size-4" />
        </Link>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
          className={iconBtn}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>

        <div className="h-4 w-px bg-border/40 mx-1" />

        {/* Theme Appearance Switcher */}
        <ThemeToggle />

        {/* Settings Navigation */}
        <Link
          to="/settings"
          title="Settings & Preferences"
          className={iconBtn}
        >
          <Settings className="size-4" />
        </Link>

        {/* Network Connectivity Indicator */}
        <div
          title={isOnline ? 'Online (Connected)' : 'Offline (No Internet)'}
          className="ml-1.5 flex items-center justify-center px-1"
        >
          {isOnline ? (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="size-2 rounded-full bg-amber-500" />
          )}
        </div>
      </div>
    </header>
  )
})

