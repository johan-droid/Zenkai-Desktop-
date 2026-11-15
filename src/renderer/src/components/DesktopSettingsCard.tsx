import { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  Laptop,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react'
import type { Settings } from '../../../shared/settings.schema'
import type { IpcEvents } from '../../../shared/ipc-contract'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-7 w-12 rounded-full border transition',
        on ? 'border-transparent bg-accent' : 'border-border bg-card-2'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
          on ? 'left-6' : 'left-0.5'
        )}
      />
    </button>
  )
}

interface LatencyStatus {
  target: string
  label: string
  ms: number | null
  status: 'pending' | 'ok' | 'slow' | 'down'
}

export function DesktopSettingsCard() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [appVersion, setAppVersion] = useState<string>('0.0.1')
  const [updaterStatus, setUpdaterStatus] = useState<IpcEvents['updater:status']>({
    status: 'idle',
  })
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [latencies, setLatencies] = useState<LatencyStatus[]>([
    { target: 'https://graphql.anilist.co', label: 'AniList GraphQL API', ms: null, status: 'pending' },
    { target: 'https://api.github.com', label: 'GitHub Releases API', ms: null, status: 'pending' },
    { target: 'https://zenkaii.pages.dev', label: 'Cloud CDN / Web Assets', ms: null, status: 'pending' },
  ])
  const [probing, setProbing] = useState(false)

  // 1. Initial Load of settings & version
  useEffect(() => {
    if (typeof window === 'undefined' || !window.zenkai) return

    void window.zenkai.settings.get().then((s) => setSettings(s))
    void window.zenkai.app.version().then((v) => setAppVersion(v))

    const unsubscribe = window.zenkai.app.onStatus((status) => {
      setUpdaterStatus(status)
      if (status.status === 'checking') setCheckingUpdate(true)
      else setCheckingUpdate(false)

      if (status.status === 'downloading') setDownloading(true)
      else if (status.status === 'downloaded' || status.status === 'error') setDownloading(false)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  // 2. Settings update helper
  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!window.zenkai) return
    try {
      const updated = await window.zenkai.settings.set({ [key]: value })
      setSettings(updated)
      toast(`Settings updated`)
    } catch (err) {
      toast(`Failed to update setting: ${String(err)}`, 'error')
    }
  }, [])

  // 3. Manual update check
  const handleCheckUpdate = async () => {
    if (!window.zenkai || checkingUpdate) return
    setCheckingUpdate(true)
    try {
      const result = await window.zenkai.app.checkUpdate()
      if (result.updateAvailable && result.version) {
        toast(`Update available: v${result.version}`)
      } else {
        toast(`Zenkai Desktop is up to date (v${appVersion})`)
      }
    } catch (err) {
      toast(`Update check failed: ${String(err)}`, 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }

  // 4. Download update
  const handleStartDownload = async () => {
    if (!window.zenkai || downloading) return
    setDownloading(true)
    try {
      const res = await window.zenkai.app.startUpdateDownload()
      if (!res.success && res.message) {
        toast(res.message, 'error')
        setDownloading(false)
      } else {
        toast(`Starting download...`)
      }
    } catch (err) {
      toast(`Failed to start download: ${String(err)}`, 'error')
      setDownloading(false)
    }
  }

  // 5. Install & restart
  const handleInstallUpdate = async () => {
    if (!window.zenkai) return
    try {
      await window.zenkai.app.installUpdate()
    } catch (err) {
      toast(`Install deferred: ${String(err)}`, 'error')
    }
  }

  // 6. Latency diagnostics runner
  const runDiagnostics = async () => {
    setProbing(true)
    const updated: LatencyStatus[] = []

    for (const item of latencies) {
      const t0 = performance.now()
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 4000)
        await fetch(item.target, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
        clearTimeout(timer)
        const ms = Math.round(performance.now() - t0)
        updated.push({
          ...item,
          ms,
          status: ms < 400 ? 'ok' : 'slow',
        })
      } catch {
        updated.push({
          ...item,
          ms: null,
          status: 'down',
        })
      }
    }

    setLatencies(updated)
    setProbing(false)
    toast('Diagnostics completed')
  }

  return (
    <div className="space-y-6">
      {/* 1. Update Manager & Channel */}
      <section className="rounded-3xl border border-border bg-card/60 p-5 sm:p-7 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Laptop className="size-5 text-accent" />
              <h2 className="font-display text-xl font-bold">Desktop &amp; Updates</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              Manage application releases, update channels, and offline streaming settings.
            </p>
          </div>
          <span className="rounded-full bg-foreground/10 px-3 py-1 font-mono text-xs font-semibold text-foreground">
            v{appVersion}
          </span>
        </div>

        <Row title="Release Channel" hint="Choose between stable releases and bleeding-edge beta testing">
          <div className="inline-flex gap-1 rounded-full border border-border bg-card/60 p-1">
            {(['stable', 'beta'] as const).map((ch) => {
              const active = (settings?.channel ?? 'stable') === ch
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => updateSetting('channel', ch)}
                  aria-pressed={active}
                  className={cn(
                    'h-8 rounded-full px-3.5 text-xs font-bold uppercase transition',
                    active ? 'bg-foreground text-background shadow' : 'text-muted hover:text-foreground'
                  )}
                >
                  {ch}
                </button>
              )
            })}
          </div>
        </Row>

        <Row
          title="Application Updates"
          hint={
            updaterStatus.status === 'downloading'
              ? `Downloading update: ${updaterStatus.progress ?? 0}%`
              : updaterStatus.status === 'downloaded'
                ? `Update v${updaterStatus.version ?? ''} downloaded and ready to apply`
                : 'Check GitHub for newer versions of Zenkai Desktop'
          }
        >
          <div className="flex items-center gap-2">
            {updaterStatus.status === 'downloaded' ? (
              <button
                type="button"
                onClick={handleInstallUpdate}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-xs font-bold text-accent-fg shadow-lg shadow-accent/25 transition hover:brightness-110 active:scale-95"
              >
                <Sparkles className="size-3.5" />
                <span>Restart &amp; Install</span>
              </button>
            ) : updaterStatus.status === 'available' ? (
              <button
                type="button"
                onClick={handleStartDownload}
                disabled={downloading}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-xs font-bold text-accent-fg shadow-lg shadow-accent/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                <Download className="size-3.5" />
                <span>Download v{updaterStatus.version}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:border-foreground/40 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={cn('size-3.5', checkingUpdate && 'animate-spin')} />
                <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
              </button>
            )}
          </div>
        </Row>

        {/* Download Progress Bar if downloading */}
        {updaterStatus.status === 'downloading' && (
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs font-mono text-muted">
              <span>Downloading update package</span>
              <span>{updaterStatus.progress ?? 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${updaterStatus.progress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Active Playback Invariant Notice */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-accent/20 bg-accent/5 p-3.5 text-xs text-muted">
          <Shield className="size-4 shrink-0 text-accent mt-0.5" />
          <p>
            <strong className="text-foreground font-semibold">Active Playback Protection:</strong> Zenkai Desktop
            automatically suppresses intrusive popups, heavy downloads, and restarts while you are actively watching video.
          </p>
        </div>
      </section>

      {/* 2. Desktop System Integration Preferences */}
      <section className="rounded-3xl border border-border bg-card/60 p-5 sm:p-7 shadow-lg space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Native Desktop Integrations</h2>
          <p className="mt-1 text-xs text-muted">Configure hardware acceleration, window behaviors, and Discord presence.</p>
        </div>

        <Row title="Hardware Accelerated Decoding" hint="Uses your GPU for smooth, efficient 1080p and 4K video playback">
          <Switch
            on={settings?.hwDecode ?? true}
            onChange={(v) => updateSetting('hwDecode', v)}
            label="Hardware accelerated decoding"
          />
        </Row>

        <Row title="Auto-Pause on Minimize / Close" hint="Automatically pauses video playback when the window is hidden">
          <Switch
            on={settings?.pauseOnClose ?? true}
            onChange={(v) => updateSetting('pauseOnClose', v)}
            label="Auto-pause on close"
          />
        </Row>

        <Row title="Discord Rich Presence" hint="Display what anime and episode you are currently watching in Discord">
          <Switch
            on={settings?.rpcEnabled ?? true}
            onChange={(v) => updateSetting('rpcEnabled', v)}
            label="Discord Rich Presence"
          />
        </Row>

        <Row
          title="Download Storage Location"
          hint={settings?.downloadDir ? `Downloads saved to: ${settings.downloadDir}` : 'Default system Downloads folder'}
        >
          {settings?.downloadDir && (
            <button
              type="button"
              onClick={() => {
                if (window.zenkai?.app.openFile) {
                  void window.zenkai.app.openFile(settings.downloadDir)
                }
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-foreground/40 active:scale-95"
            >
              <FolderOpen className="size-3.5 text-muted" />
              <span>Open Folder</span>
            </button>
          )}
        </Row>
      </section>

      {/* 3. Playback Health Center & Diagnostics */}
      <section className="rounded-3xl border border-border bg-card/60 p-5 sm:p-7 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-accent" />
              <h2 className="font-display text-xl font-bold">Playback Health Center</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              Live network diagnostics, API connectivity latency, and playback service health.
            </p>
          </div>
          <button
            type="button"
            onClick={runDiagnostics}
            disabled={probing}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-foreground/40 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', probing && 'animate-spin')} />
            <span>{probing ? 'Probing...' : 'Run Diagnostics'}</span>
          </button>
        </div>

        <div className="space-y-2 pt-1">
          {latencies.map((item) => (
            <div
              key={item.target}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs font-mono text-muted truncate">{item.target}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.status === 'ok' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-mono font-bold text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    <span>{item.ms} ms</span>
                  </span>
                ) : item.status === 'slow' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-mono font-bold text-amber-400">
                    <AlertCircle className="size-3.5" />
                    <span>{item.ms} ms</span>
                  </span>
                ) : item.status === 'down' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-mono font-bold text-red-400">
                    <AlertCircle className="size-3.5" />
                    <span>Unreachable</span>
                  </span>
                ) : (
                  <span className="text-xs font-mono text-muted">Untested</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
