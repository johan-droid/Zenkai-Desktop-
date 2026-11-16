import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, CheckCircle2, RefreshCw, X, Zap, AlertCircle } from 'lucide-react'
import type { IpcEvents } from '../../../shared/ipc-contract'

export function UpdatePrompt() {
  const [status, setStatus] = useState<IpcEvents['updater:status']>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.zenkai?.app) return

    // 1. Listen for background & IPC updater status events
    const unbind = window.zenkai.app.onStatus((s) => {
      setStatus(s)
      if (s.status === 'available' || s.status === 'downloaded') {
        setDismissed(false)
      }
    })

    // 2. Proactively check GitHub releases on launch
    void window.zenkai.app
      .checkUpdate()
      .then((res) => {
        if (res?.updateAvailable && res.version) {
          setStatus({
            status: 'available',
            version: res.version,
            notes: res.notes,
          })
          setDismissed(false)
        }
      })
      .catch(() => {})

    return () => {
      unbind?.()
    }
  }, [])

  // Only statuses with content render; checking/verifying used to leave an empty card on screen.
  const visible =
    status.status === 'available' ||
    status.status === 'downloading' ||
    status.status === 'downloaded' ||
    status.status === 'error'

  if (dismissed || !visible) {
    return null
  }

  const handleDownload = async () => {
    if (!window.zenkai?.app) return
    try {
      await window.zenkai.app.startUpdateDownload()
    } catch {
      // handled via updater:status
    }
  }

  const handleInstall = async () => {
    if (!window.zenkai?.app || installing) return
    setInstalling(true)
    try {
      await window.zenkai.app.installUpdate()
    } catch {
      setInstalling(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: 32, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="fixed bottom-6 right-6 z-50 flex w-[340px] max-w-[calc(100vw-3rem)] flex-col gap-3 rounded-2xl border border-white/10 bg-card/95 p-4 text-foreground shadow-2xl shadow-black/60 backdrop-blur-2xl ring-1 ring-white/10"
        role="region"
        aria-label="Application Update Notification"
      >
        {status.status === 'available' && (
          <>
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent ring-1 ring-accent/30">
                <Zap className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-bold tracking-tight">Update Available</h4>
                  <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/10 hover:text-foreground active:scale-95"
                    aria-label="Dismiss"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Version <span className="font-semibold text-foreground">v{status.version}</span> is available to download.
                </p>
              </div>
            </div>

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-fg shadow-lg shadow-accent/20 transition-transform hover:brightness-110 active:scale-95"
              >
                <ArrowDownToLine className="size-3.5" />
                <span>Pull & Update Now</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-xl border border-border bg-white/[0.04] px-3 py-2 text-xs font-semibold text-muted transition hover:bg-white/[0.08] hover:text-foreground active:scale-95"
              >
                Later
              </button>
            </div>
          </>
        )}

        {status.status === 'downloading' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin text-accent" />
                Pulling Update v{status.version || ''}...
              </span>
              <span className="font-mono text-accent">{status.progress ?? 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${status.progress ?? 0}%` }}
              />
            </div>
            <p className="text-[11px] text-muted">Downloading release assets in the background.</p>
          </div>
        )}

        {status.status === 'downloaded' && (
          <>
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-bold text-foreground">Update Ready</h4>
                  <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/10 hover:text-foreground active:scale-95"
                    aria-label="Dismiss"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Version <span className="font-semibold text-foreground">v{status.version}</span> downloaded. Restart to apply.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${installing ? 'animate-spin' : ''}`} />
              <span>{installing ? 'Restarting...' : 'Restart & Apply Update'}</span>
            </button>
          </>
        )}

        {status.status === 'error' && (
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <h5 className="text-xs font-bold text-red-400">Update Check Notice</h5>
              <p className="text-[11px] text-muted">{status.error || 'Failed to pull update'}</p>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="grid size-5 place-items-center rounded text-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  )
}
