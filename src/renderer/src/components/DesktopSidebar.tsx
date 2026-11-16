import { memo, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LOGO_URL } from '../lib/constants'
import {
  House,
  Clapperboard,
  Compass,
  Archive,
  CalendarDays,
  BookOpen,
  Book,
  Search,
  PanelLeft,
  Tv,
  Users,
  MessageSquare,
  Heart,
  Sparkles,
  Download,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { toast } from '../lib/toast'
import { useSearch } from '../context/SearchContext'
import { useProfile } from '../lib/profile'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Avatar'
import { ThemeToggle } from './ThemeToggle'

interface DesktopSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

type Item = { label: string; icon: LucideIcon; to?: string; match?: (p: string) => boolean; onClick?: () => void; badge?: number }

const getMain = (activeDownloads: number): Item[] => [
  { label: 'Home', to: '/home', icon: House, match: (p) => p === '/' || p === '/home' },
  { label: 'Movies & TV', to: '/movies', icon: Clapperboard, match: (p) => p.startsWith('/movies') },
  { label: 'Browse', to: '/browse', icon: Compass, match: (p) => p.startsWith('/browse') || p === '/trending' || p === '/popular' || p === '/top' },
  { label: 'Library', to: '/list', icon: Archive, match: (p) => p.startsWith('/list') },
  { label: 'Downloads', to: '/downloads', icon: Download, match: (p) => p.startsWith('/downloads'), badge: activeDownloads },
  { label: 'Schedule', to: '/schedule', icon: CalendarDays, match: (p) => p.startsWith('/schedule') },
  { label: 'Manga', to: '/manga', icon: BookOpen, match: (p) => p.startsWith('/manga') },
  { label: 'Novels', to: '/novel', icon: Book, match: (p) => p.startsWith('/novel') },
  { label: 'Vision Studio', to: '/vision', icon: Sparkles, match: (p) => p.startsWith('/vision') },
]

const MORE: Item[] = [
  { label: 'WatchParty', to: '/watchparty', icon: Tv, match: (p) => p.startsWith('/watchparty') || p.startsWith('/watchtogether') },
  { label: 'Community', to: '/community', icon: Users, match: (p) => p.startsWith('/community') },
  { label: 'Messages', to: '/messages', icon: MessageSquare, match: (p) => p.startsWith('/messages') },
  { label: 'Support', to: '/support', icon: Heart, match: (p) => p === '/support' },
]

const iconBtn = 'grid place-items-center text-muted hover:text-foreground hover:bg-foreground/[0.06] transition-colors active:scale-95'

function NavItem({ item, collapsed, active }: { item: Item; collapsed: boolean; active: boolean }) {
  const Icon = item.icon
  const cls = cn(
    'relative flex items-center rounded-2xl transition-colors duration-150',
    collapsed ? 'size-11 mx-auto justify-center' : 'gap-3.5 px-3.5 py-2.5',
    active
      ? 'bg-foreground/[0.10] text-foreground ring-1 ring-foreground/10 ' + (collapsed ? '' : 'font-semibold')
      : 'text-muted hover:text-foreground hover:bg-foreground/[0.06]',
  )
  const body = (
    <>
      {active && !collapsed && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-foreground" />}
      <Icon className={collapsed ? 'size-5' : 'size-4 shrink-0'} />
      {!collapsed && <span className="truncate text-[13px] font-medium">{item.label}</span>}
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className={cn(
            'flex items-center justify-center font-bold text-[10px] bg-emerald-500 text-black rounded-full',
            collapsed ? 'absolute top-1.5 right-1.5 size-2 p-0' : 'ml-auto px-1.5 py-0.2 min-w-4 h-4'
          )}
        >
          {collapsed ? '' : item.badge}
        </span>
      )}
    </>
  )
  const title = collapsed ? item.label : undefined
  return item.to ? (
    <Link to={item.to} title={title} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={item.onClick} title={title} className={cn(cls, !collapsed && 'w-full text-left')}>
      {body}
    </button>
  )
}

export const DesktopSidebar = memo(function DesktopSidebar({ collapsed, onToggle }: DesktopSidebarProps) {
  const { pathname } = useLocation()
  const { openSearch } = useSearch()
  const { user } = useAuth()
  const profile = useProfile()
  const [activeDownloads, setActiveDownloads] = useState(0)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)

  const handleCheckUpdates = async () => {
    if (!window.zenkai?.app || checkingUpdates) return
    setCheckingUpdates(true)
    try {
      const res = await window.zenkai.app.checkUpdate()
      if (res?.updateAvailable) {
        setUpdateAvailable(res.version || 'new')
        toast(`Update v${res.version} available! Check bottom right prompt.`, 'success')
      } else {
        setUpdateAvailable(null)
        toast('Zenkai Desktop is up to date', 'info')
      }
    } catch {
      toast('Failed to check for updates', 'error')
    } finally {
      setCheckingUpdates(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.zenkai?.app) return

    const unbind = window.zenkai.app.onStatus((s) => {
      if (s.status === 'available') {
        setUpdateAvailable(s.version || 'new')
      } else if (s.status === 'not-available' || s.status === 'downloaded') {
        setUpdateAvailable(null)
      }
    })

    window.zenkai.app.checkUpdate().then((res) => {
      if (res?.updateAvailable && res.version) {
        setUpdateAvailable(res.version)
      }
    }).catch(() => {})

    return () => unbind?.()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.zenkai?.downloads) return
    const update = () => {
      window.zenkai.downloads.list().then((items) => {
        const count = (items || []).filter((i) => i.status === 'active' || i.status === 'queued').length
        setActiveDownloads(count)
      }).catch(() => {})
    }
    update()
    const timer = window.setInterval(update, 3000)
    return () => window.clearInterval(timer)
  }, [])

  const isLoggedIn = Boolean(user)
  const displayName = isLoggedIn
    ? (profile.name || user?.user_metadata?.full_name || user?.user_metadata?.username || user?.email?.split('@')[0] || 'User')
    : 'Guest'

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden md:flex isolate flex-col justify-between bg-background border-r border-border select-none transition-[width] duration-200 ease-out py-3.5',
        collapsed ? 'w-[68px] px-2 items-center' : 'w-56 px-3',
      )}
      aria-label="Desktop Navigation"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-black opacity-70 mix-blend-overlay" />

      <div className="w-full space-y-4">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 pt-0.5">
            <Link to="/home" title="Zenkai Home" className="grid size-9 place-items-center rounded-xl transition hover:opacity-90 active:scale-95">
              <img src={LOGO_URL} alt="Zenkai" className="size-7 object-contain drop-shadow" />
            </Link>
            <button type="button" onClick={onToggle} title="Expand sidebar" className={cn(iconBtn, 'size-10 rounded-xl')}>
              <PanelLeft className="size-5" />
            </button>
            <button type="button" onClick={() => openSearch()} title="Search (Ctrl + K)" className={cn(iconBtn, 'size-10 rounded-xl')}>
              <Search className="size-5" />
            </button>
          </div>
        ) : (
          <div className="flex h-11 items-center justify-between px-2">
            <Link to="/home" className="group flex min-w-0 items-center gap-2.5">
              <img src={LOGO_URL} alt="Zenkai" className="size-7 shrink-0 object-contain drop-shadow transition-transform duration-200 group-hover:scale-105" />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-display text-[15px] font-bold tracking-tight text-foreground">Zenkai</span>
                <span className="font-mono text-[11px] font-medium tracking-tight text-muted">zenkai.cfd</span>
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => openSearch()} title="Search (Ctrl + K)" className={cn(iconBtn, 'size-8 rounded-lg')}>
                <Search className="size-4" />
              </button>
              <button type="button" onClick={onToggle} title="Collapse sidebar" className={cn(iconBtn, 'size-8 rounded-lg')}>
                <PanelLeft className="size-4" />
              </button>
            </div>
          </div>
        )}

        <nav className="w-full space-y-1 pt-0.5">
          {getMain(activeDownloads).map((item) => (
            <NavItem
              key={item.label}
              item={item}
              collapsed={collapsed}
              active={Boolean(item.match?.(pathname))}
            />
          ))}
        </nav>
      </div>

      <div className="w-full space-y-1 border-t border-border pt-3">
        {MORE.map((item) => (
          <NavItem key={item.label} item={item} collapsed={collapsed} active={Boolean(item.match?.(pathname))} />
        ))}

        {collapsed ? (
          <button
            type="button"
            onClick={handleCheckUpdates}
            title={updateAvailable ? `Update v${updateAvailable} available` : 'Check for updates'}
            className={cn(iconBtn, 'relative size-11 mx-auto rounded-2xl')}
          >
            <RefreshCw className={cn('size-4', checkingUpdates && 'animate-spin text-accent')} />
            {updateAvailable && (
              <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-accent ring-2 ring-background animate-pulse" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheckUpdates}
            className="flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2 text-[13px] font-medium text-muted transition hover:bg-foreground/[0.06] hover:text-foreground active:scale-95"
          >
            <div className="relative">
              <RefreshCw className={cn('size-4 shrink-0', checkingUpdates && 'animate-spin text-accent')} />
              {updateAvailable && (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            <span>{checkingUpdates ? 'Checking for updates...' : 'Check for updates'}</span>
            {updateAvailable && (
              <span className="ml-auto rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent ring-1 ring-accent/30 animate-pulse">
                v{updateAvailable}
              </span>
            )}
          </button>
        )}

        <div className={cn('flex items-center', collapsed ? 'justify-center py-1' : 'justify-between px-3 py-1')}>
          {!collapsed && <span className="text-xs text-muted font-medium">Appearance</span>}
          <ThemeToggle />
        </div>

        {collapsed ? (
          <Link to="/profile" title={displayName} className="relative mx-auto mt-1 flex size-11 items-center justify-center rounded-2xl transition hover:bg-foreground/[0.06]">
            <Avatar size={32} src={profile.avatar} frame={profile.frame} name={displayName} animateFrame />
          </Link>
        ) : (
          <Link to="/profile" className="group mt-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-foreground/[0.06]">
            <div className="relative shrink-0">
              <Avatar size={32} src={profile.avatar} frame={profile.frame} name={displayName} animateFrame />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold text-foreground transition-colors group-hover:text-accent">{displayName}</span>
              <span className="text-[10px] font-medium text-muted">{isLoggedIn ? 'Online' : 'Not signed in'}</span>
            </div>
          </Link>
        )}
      </div>
    </aside>
  )
})
