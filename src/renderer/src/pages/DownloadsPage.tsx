import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Download,
  FolderOpen,
  Play,
  Trash2,
  HardDrive,
  RefreshCw,
  Film,
  Sparkles,
} from 'lucide-react'
import type { DownloadItem } from '../../../shared/ipc-contract'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadDir, setDownloadDir] = useState<string>('')
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  const fetchList = useCallback(async () => {
    if (typeof window === 'undefined' || !window.zenkai?.downloads) {
      setLoading(false)
      return
    }
    try {
      const items = await window.zenkai.downloads.list()
      setDownloads(items || [])
    } catch (err) {
      console.error('Failed to list downloads:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.title = 'Offline Downloads — Zenkai'

    if (window.zenkai?.settings) {
      window.zenkai.settings.get().then((s) => {
        if (s.downloadDir) setDownloadDir(s.downloadDir)
      }).catch(() => {})
    }

    void fetchList()

    // Poll frequently if active items exist
    const interval = window.setInterval(() => {
      void fetchList()
    }, 2000)

    return () => window.clearInterval(interval)
  }, [fetchList])

  const handleOpenFolder = (filePath?: string) => {
    const target = filePath || downloadDir
    if (!target || !window.zenkai?.app.openFile) return
    window.zenkai.app.openFile(target).catch(() => {
      toast('Failed to open folder', 'error')
    })
  }

  const handlePlayFile = (filePath?: string) => {
    if (!filePath || !window.zenkai?.app.openFile) return
    window.zenkai.app.openFile(filePath).catch(() => {
      toast('Failed to open video file', 'error')
    })
  }

  const handleRemove = async (id: string, name: string) => {
    if (!window.zenkai?.downloads) return
    try {
      await window.zenkai.downloads.remove(id)
      setDownloads((prev) => prev.filter((d) => d.id !== id))
      toast(`Removed ${name}`)
    } catch {
      toast('Failed to remove download', 'error')
    }
  }

  const activeItems = useMemo(
    () => downloads.filter((d) => d.status === 'active' || d.status === 'queued' || d.status === 'paused'),
    [downloads]
  )
  const completedItems = useMemo(
    () => downloads.filter((d) => d.status === 'done'),
    [downloads]
  )
  const totalCompletedBytes = useMemo(
    () => completedItems.reduce((acc, cur) => acc + (cur.bytes || cur.total || 0), 0),
    [completedItems]
  )

  const shownItems = useMemo(() => {
    if (filter === 'active') return activeItems
    if (filter === 'done') return completedItems
    return downloads
  }, [filter, downloads, activeItems, completedItems])

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pt-10">
      {/* 1. Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-2xl bg-accent/15 text-accent">
              <Download className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Offline Downloads
              </h1>
              <p className="text-xs text-muted">
                High-speed local HLS/MP4 downloads with embedded subtitles and offline playback.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {downloadDir && (
            <button
              type="button"
              onClick={() => handleOpenFolder()}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card/60 px-4 text-xs font-semibold text-foreground transition hover:border-foreground/40 active:scale-95"
            >
              <FolderOpen className="size-3.5 text-muted" />
              <span>Downloads Folder</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void fetchList()}
            className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card/60 text-muted transition hover:text-foreground active:scale-95"
            title="Refresh downloads list"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* 2. Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <span className="text-xs font-medium text-muted">Active Downloads</span>
          <p className="mt-1 font-mono text-2xl font-bold text-accent">{activeItems.length}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <span className="text-xs font-medium text-muted">Completed Episodes</span>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{completedItems.length}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <span className="text-xs font-medium text-muted">Offline Disk Footprint</span>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">{formatBytes(totalCompletedBytes)}</p>
        </div>
      </div>

      {/* 3. Filter Tabs */}
      <div className="flex gap-2 border-b border-border/60 pb-1">
        {(['all', 'active', 'done'] as const).map((tab) => {
          const count = tab === 'active' ? activeItems.length : tab === 'done' ? completedItems.length : downloads.length
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition',
                filter === tab
                  ? 'bg-foreground text-background shadow'
                  : 'text-muted hover:text-foreground hover:bg-foreground/5'
              )}
            >
              <span className="capitalize">{tab === 'done' ? 'Completed' : tab}</span>
              <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-mono">
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 4. Downloads List */}
      {shownItems.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-border px-6 py-20 text-center">
          <HardDrive className="size-12 text-muted" />
          <p className="mt-4 text-base font-semibold text-foreground">
            {filter === 'active' ? 'No active downloads' : filter === 'done' ? 'No completed downloads' : 'No downloads yet'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            Click the download button in CinePlayer or on any episode card to save episodes for offline viewing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shownItems.map((item) => {
            const isDone = item.status === 'done'
            const isError = item.status === 'error'
            const pct = item.total > 0
              ? Math.min(100, Math.round((item.bytes / item.total) * 100))
              : item.segmentsTotal && item.segmentsDone
                ? Math.min(100, Math.round((item.segmentsDone / item.segmentsTotal) * 100))
                : 0

            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/50 p-4 transition hover:border-foreground/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Film className="size-4 shrink-0 text-accent" />
                    <h3 className="truncate font-semibold text-sm text-foreground">
                      {item.name || item.id}
                    </h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
                        isDone && 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                        item.status === 'active' && 'bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pulse',
                        item.status === 'queued' && 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                        isError && 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      )}
                    >
                      {item.status}
                    </span>
                    {item.audio && (
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
                        {item.audio}
                      </span>
                    )}
                  </div>

                  {/* Progress & metrics */}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted">
                    {item.total > 0 ? (
                      <span>
                        {formatBytes(item.bytes)} / {formatBytes(item.total)} ({pct}%)
                      </span>
                    ) : item.segmentsTotal ? (
                      <span>
                        Segment {item.segmentsDone ?? 0} / {item.segmentsTotal} ({pct}%)
                      </span>
                    ) : (
                      <span>{formatBytes(item.bytes)}</span>
                    )}
                    {item.server && <span>Server: {item.server}</span>}
                    {item.path && <span className="truncate max-w-xs">{item.path}</span>}
                  </div>

                  {!isDone && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40 mt-1">
                      <div
                        className={cn(
                          'h-full transition-all duration-300',
                          isError ? 'bg-rose-500' : 'bg-accent'
                        )}
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {isDone && item.path && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePlayFile(item.path)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-bold text-accent-fg shadow-lg shadow-accent/25 transition hover:brightness-110 active:scale-95"
                      >
                        <Play className="size-3.5 fill-current" />
                        <span>Play</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenFolder(item.path)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-foreground/40 active:scale-95"
                        title="Show in folder"
                      >
                        <FolderOpen className="size-3.5 text-muted" />
                        <span>Locate</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id, item.name || item.id)}
                    className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted transition hover:border-rose-500/50 hover:text-rose-400 active:scale-95"
                    title="Remove download"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
