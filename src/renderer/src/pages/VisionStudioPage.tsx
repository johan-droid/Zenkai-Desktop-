import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Sparkles,
  Play,
  Pause,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cpu,
  Layers,
  FolderOpen,
  Film,
  Sliders,
  Check,
  Eye,
  Trash2,
  FileVideo,
} from 'lucide-react'
import type { VisionHardwareProfile, VisionWorkerStatus } from '../../../shared/vision-types'
import type { VisionModelManifest, ModelVerificationResult, InferenceBenchmarkResult } from '../../../shared/vision-models'
import type {
  VisionJob,
  VisionJobOptions,
  VisionJobProgress,
  VisionVideoMetadata,
} from '../../../shared/vision-jobs'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'

function formatSeconds(secs: number): string {
  if (!secs || secs < 0) return '00:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  const h = Math.floor(m / 60)
  if (h > 0) {
    const remM = m % 60
    return `${h}h ${remM < 10 ? '0' : ''}${remM}m ${s < 10 ? '0' : ''}${s}s`
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx++
  }
  return `${size.toFixed(1)} ${units[idx]}`
}

export default function VisionStudioPage() {
  const [activeTab, setActiveTab] = useState<'queue' | 'new' | 'models' | 'compare'>('queue')

  // Hardware and diagnostics
  const [hardware, setHardware] = useState<VisionHardwareProfile | null>(null)
  const [workerStatus, setWorkerStatus] = useState<VisionWorkerStatus | null>(null)
  const [models, setModels] = useState<VisionModelManifest[]>([])

  // Queue state
  const [jobs, setJobs] = useState<VisionJob[]>([])
  const [activeProgress, setActiveProgress] = useState<Record<string, VisionJobProgress>>({})

  // New Job state
  const [inputPath, setInputPath] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<string>('real-esrgan-animevideo-v3')
  const [targetResolution, setTargetResolution] = useState<'1080p' | '1440p' | '4k' | '8k'>('4k')
  const [encoder, setEncoder] = useState<'auto' | 'nvenc' | 'vaapi' | 'libx264' | 'libx265'>('auto')
  const [probingVideo, setProbingVideo] = useState(false)
  const [videoMeta, setVideoMeta] = useState<VisionVideoMetadata | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Verification & Benchmark state
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [verificationMap, setVerificationMap] = useState<Record<string, ModelVerificationResult>>({})
  const [benchmarkMap, setBenchmarkMap] = useState<Record<string, InferenceBenchmarkResult>>({})
  const [benchmarkingId, setBenchmarkingId] = useState<string | null>(null)

  // Comparison slider
  const [sliderPos, setSliderPos] = useState(50)
  const sliderRef = useRef<HTMLDivElement>(null)

  // Load hardware, models & existing jobs
  const refreshJobs = useCallback(async () => {
    if (typeof window === 'undefined' || !window.zenkai?.vision) return
    try {
      const list = await window.zenkai.vision.getJobs()
      setJobs(list)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.zenkai?.vision) return

    void window.zenkai.vision.getHardwareProfile().then(setHardware)
    void window.zenkai.vision.getWorkerStatus().then(setWorkerStatus)
    void window.zenkai.vision.getModels().then((m) => {
      setModels(m)
      if (m.length > 0 && !selectedModelId) {
        setSelectedModelId(m[0].id)
      }
    })
    void refreshJobs()

    const unsubProgress = window.zenkai.vision.onJobProgress((prog) => {
      setActiveProgress((prev) => ({ ...prev, [prog.jobId]: prog }))
      setJobs((prev) =>
        prev.map((j) => (j.id === prog.jobId ? { ...j, status: prog.status, progress: prog } : j)),
      )
    })

    const unsubList = window.zenkai.vision.onJobListChanged((newList) => {
      setJobs(newList)
    })

    const unsubWorker = window.zenkai.vision.onWorkerStatusChanged((ws) => {
      setWorkerStatus(ws)
    })

    return () => {
      unsubProgress?.()
      unsubList?.()
      unsubWorker?.()
    }
  }, [refreshJobs, selectedModelId])

  // Probe source video when inputPath changes
  const handleProbe = async (path: string) => {
    if (!path.trim() || !window.zenkai?.vision) return
    setProbingVideo(true)
    setProbeError(null)
    setVideoMeta(null)
    try {
      const meta = await window.zenkai.vision.probeVideo(path)
      setVideoMeta(meta)

      // Suggest default output path
      if (!outputPath) {
        const ext = path.lastIndexOf('.')
        const base = ext !== -1 ? path.substring(0, ext) : path
        setOutputPath(`${base}_enhanced_${targetResolution}.mp4`)
      }
      toast('Video probed successfully', 'success')
    } catch (err: any) {
      setProbeError(err?.message || 'Failed to probe video file')
    } finally {
      setProbingVideo(false)
    }
  }

  // Handle target resolution change
  const handleResolutionChange = (res: '1080p' | '1440p' | '4k' | '8k') => {
    setTargetResolution(res)
    if (inputPath && outputPath.includes('_enhanced_')) {
      const ext = inputPath.lastIndexOf('.')
      const base = ext !== -1 ? inputPath.substring(0, ext) : inputPath
      setOutputPath(`${base}_enhanced_${res}.mp4`)
    }
  }

  // Queue job
  const handleCreateJob = async () => {
    if (!inputPath.trim()) {
      toast('Please specify an input video file path', 'error')
      return
    }
    if (!outputPath.trim()) {
      toast('Please specify an output video file path', 'error')
      return
    }
    if (!window.zenkai?.vision) return

    setSubmitting(true)
    try {
      const jobOpts: VisionJobOptions = {
        inputPath: inputPath.trim(),
        outputPath: outputPath.trim(),
        modelId: selectedModelId,
        targetResolution,
        encoder,
        audioMode: 'passthrough',
        subtitlesMode: 'passthrough',
        preserveMetadata: true,
      }

      await window.zenkai.vision.createJob(jobOpts)
      toast('Enhancement job added to queue', 'success')
      setInputPath('')
      setOutputPath('')
      setVideoMeta(null)
      setActiveTab('queue')
      void refreshJobs()
    } catch (err: any) {
      toast(err?.message || 'Failed to create enhancement job', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Job Controls
  const handlePause = async (jobId: string) => {
    if (!window.zenkai?.vision) return
    try {
      await window.zenkai.vision.pauseJob(jobId)
      toast('Job paused', 'info')
      void refreshJobs()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleResume = async (jobId: string) => {
    if (!window.zenkai?.vision) return
    try {
      await window.zenkai.vision.resumeJob(jobId)
      toast('Job resumed', 'info')
      void refreshJobs()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleCancel = async (jobId: string) => {
    if (!window.zenkai?.vision) return
    try {
      await window.zenkai.vision.cancelJob(jobId)
      toast('Job cancelled', 'info')
      void refreshJobs()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (jobId: string) => {
    if (!window.zenkai?.vision) return
    try {
      await window.zenkai.vision.deleteJob(jobId)
      toast('Job deleted', 'info')
      void refreshJobs()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleClearCompleted = async () => {
    if (!window.zenkai?.vision) return
    try {
      await window.zenkai.vision.clearCompletedJobs()
      toast('Completed jobs cleared', 'info')
      void refreshJobs()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  // Model verification & benchmark
  const handleVerify = async (modelId: string) => {
    if (!window.zenkai?.vision) return
    setVerifyingId(modelId)
    try {
      const res = await window.zenkai.vision.verifyModel(modelId)
      setVerificationMap((prev) => ({ ...prev, [modelId]: res }))
      if (res.valid) {
        toast(`Model ${modelId} verified (SHA-256 match)`, 'success')
      } else {
        toast(res.error || 'Verification failed', 'info')
      }
    } catch (err: any) {
      toast(err?.message || 'Verification error', 'error')
    } finally {
      setVerifyingId(null)
    }
  }

  const handleBenchmark = async (modelId: string) => {
    if (!window.zenkai?.vision) return
    setBenchmarkingId(modelId)
    try {
      const res = await window.zenkai.vision.runBenchmark({ modelId })
      setBenchmarkMap((prev) => ({ ...prev, [modelId]: res }))
      toast(`Benchmark completed: ${res.latencyMs}ms (${res.provider})`, 'success')
    } catch (err: any) {
      toast(err?.message || 'Benchmark error', 'error')
    } finally {
      setBenchmarkingId(null)
    }
  }

  // Slider dragging
  const handleSliderMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return
    const rect = sliderRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const offset = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const pct = (offset / rect.width) * 100
    setSliderPos(pct)
  }

  const activeJob = jobs.find((j) => j.status === 'processing')
  const activeProg = activeJob ? activeProgress[activeJob.id] || activeJob.progress : null

  // Resolution qualification limits
  const maxAllowedRes = hardware?.profile.maxTargetResolution || '1080p'
  const is8KAllowed = maxAllowedRes === '8k'
  const is4KAllowed = is8KAllowed || maxAllowedRes === '4k'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Studio Header */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card-2 to-card p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <Sparkles className="size-5 animate-pulse" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Zenkai Vision Studio
                </h1>
                <p className="text-xs text-muted sm:text-sm">
                  GPU-Accelerated AI Video Super-Resolution & Enhancement Subsystem
                </p>
              </div>
            </div>
          </div>

          {/* Quick Hardware Chip */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground">
              <Cpu className="size-4 text-emerald-400" />
              <span>
                {hardware?.selectedDevice
                  ? `${hardware.selectedDevice.model} (${hardware.selectedDevice.vendor.toUpperCase()})`
                  : 'CPU Engine'}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground">
              <Layers className="size-4 text-accent" />
              <span className="capitalize">
                {hardware?.profile.profile.replace('_', ' ') || 'Detecting'} Tier (Max {maxAllowedRes.toUpperCase()})
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-2.5 py-1.5 text-xs text-muted">
              <span
                className={cn(
                  'size-2 rounded-full',
                  workerStatus?.state === 'running'
                    ? 'bg-emerald-400 animate-ping'
                    : 'bg-zinc-500',
                )}
              />
              <span className="capitalize">{workerStatus?.state || 'idle'} Worker</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition',
              activeTab === 'queue'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-card text-muted hover:bg-card-2 hover:text-foreground',
            )}
          >
            <Clock className="size-4" />
            Job Queue ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition',
              activeTab === 'new'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-card text-muted hover:bg-card-2 hover:text-foreground',
            )}
          >
            <Sparkles className="size-4" />
            New Enhancement
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition',
              activeTab === 'models'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-card text-muted hover:bg-card-2 hover:text-foreground',
            )}
          >
            <Layers className="size-4" />
            AI Models ({models.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition',
              activeTab === 'compare'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-card text-muted hover:bg-card-2 hover:text-foreground',
            )}
          >
            <Eye className="size-4" />
            Visual Comparison
          </button>
        </div>
      </div>

      {/* TAB 1: JOB QUEUE */}
      {activeTab === 'queue' && (
        <div className="mt-8 space-y-6">
          {/* Active Job Real-Time Card */}
          {activeJob && activeProg && (
            <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-card to-card p-6 shadow-xl ring-1 ring-emerald-500/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Processing Enhancement
                    </span>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
                      {activeJob.options.targetResolution.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="mt-1 truncate font-display text-lg font-bold text-foreground">
                    {activeJob.options.inputPath.split(/[/|\\]/).pop()}
                  </h3>
                  <p className="text-xs text-muted">
                    Model: <span className="font-mono text-foreground">{activeJob.options.modelId}</span> •
                    Encoder: <span className="font-mono text-foreground">{activeJob.options.encoder || 'auto'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePause(activeJob.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-2"
                  >
                    <Pause className="size-3.5 text-yellow-400" />
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(activeJob.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-2 hover:text-red-400"
                  >
                    <X className="size-3.5 text-red-400" />
                    Cancel
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-muted">
                    Frame <span className="font-mono text-foreground">{activeProg.currentFrame.toLocaleString()}</span> /{' '}
                    <span className="font-mono text-foreground">{activeProg.totalFrames.toLocaleString()}</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-400">{activeProg.percent}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-card-2 ring-1 ring-border">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                    style={{ width: `${activeProg.percent}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted">
                  <span>Speed: <strong className="font-mono text-foreground">{activeProg.currentFps} FPS</strong></span>
                  <span>ETA: <strong className="font-mono text-foreground">{formatSeconds(activeProg.etaSeconds)}</strong></span>
                  <span>Elapsed: <strong className="font-mono text-foreground">{formatSeconds(activeProg.elapsedSeconds)}</strong></span>
                  <span className="capitalize">Stage: <strong className="text-emerald-400">{activeProg.stage}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Queue List */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="font-display text-base font-bold text-foreground">
                Enhancement Queue ({jobs.length})
              </h2>
              {jobs.some((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') && (
                <button
                  type="button"
                  onClick={handleClearCompleted}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card-2 px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                  Clear Finished
                </button>
              )}
            </div>

            {jobs.length === 0 ? (
              <div className="py-12 text-center">
                <FileVideo className="mx-auto size-12 text-muted/40" />
                <p className="mt-3 text-sm font-medium text-foreground">No jobs in queue</p>
                <p className="text-xs text-muted">Click "New Enhancement" above to queue a video for AI upscaling.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400"
                >
                  Start New Enhancement
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {jobs.map((job) => {
                  const prog = activeProgress[job.id] || job.progress
                  const fileName = job.options.inputPath.split(/[/|\\]/).pop()
                  return (
                    <div key={job.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'size-2 rounded-full',
                              job.status === 'processing' && 'bg-emerald-400 animate-ping',
                              job.status === 'queued' && 'bg-blue-400',
                              job.status === 'paused' && 'bg-yellow-400',
                              job.status === 'completed' && 'bg-emerald-500',
                              job.status === 'failed' && 'bg-red-400',
                              job.status === 'cancelled' && 'bg-zinc-500',
                            )}
                          />
                          <span className="truncate text-sm font-semibold text-foreground">{fileName}</span>
                          <span className="rounded bg-card-2 px-1.5 py-0.5 text-[10px] font-mono text-muted">
                            {job.options.targetResolution.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          Model: <span className="font-mono text-foreground">{job.options.modelId}</span>
                          {job.outputFileSize ? ` • Output: ${formatBytes(job.outputFileSize)}` : ''}
                          {prog.error ? ` • Error: ${prog.error}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {job.status === 'queued' && (
                          <button
                            type="button"
                            onClick={() => handlePause(job.id)}
                            className="rounded-lg border border-border bg-card-2 p-2 text-muted hover:text-foreground"
                            title="Pause"
                          >
                            <Pause className="size-4" />
                          </button>
                        )}
                        {job.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => handleResume(job.id)}
                            className="rounded-lg border border-border bg-card-2 p-2 text-emerald-400 hover:text-emerald-300"
                            title="Resume"
                          >
                            <Play className="size-4" />
                          </button>
                        )}
                        {(job.status === 'queued' || job.status === 'processing') && (
                          <button
                            type="button"
                            onClick={() => handleCancel(job.id)}
                            className="rounded-lg border border-border bg-card-2 p-2 text-muted hover:text-red-400"
                            title="Cancel"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                        {job.status === 'completed' && window.zenkai?.app?.openFile && (
                          <button
                            type="button"
                            onClick={() => window.zenkai.app.openFile?.(job.options.outputPath)}
                            className="flex items-center gap-1 rounded-lg border border-border bg-card-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-card"
                          >
                            <FolderOpen className="size-3.5 text-emerald-400" />
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(job.id)}
                          className="rounded-lg border border-border bg-card-2 p-2 text-muted hover:text-red-400"
                          title="Delete Job"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NEW ENHANCEMENT */}
      {activeTab === 'new' && (
        <div className="mt-8 space-y-6">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <h2 className="font-display text-xl font-bold text-foreground">Configure Video Enhancement</h2>
            <p className="mt-1 text-xs text-muted">
              Select a local anime or video file to upscale using deep neural networks and hardware acceleration.
            </p>

            {/* Step 1: Video File Selection */}
            <div className="mt-6 space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">1. Source Video File</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  placeholder="/path/to/source_video.mp4"
                  className="flex-1 rounded-xl border border-border bg-card-2 px-4 py-2.5 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleProbe(inputPath)}
                  disabled={probingVideo || !inputPath.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-card-2 border border-border px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-card disabled:opacity-50"
                >
                  <Film className="size-4" />
                  {probingVideo ? 'Probing...' : 'Probe Video'}
                </button>
              </div>

              {/* Probe Result Card */}
              {videoMeta && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    Video Metadata Probed
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-muted">Resolution:</span>{' '}
                      <strong className="text-foreground">{videoMeta.width}x{videoMeta.height}</strong>
                    </div>
                    <div>
                      <span className="text-muted">Framerate:</span>{' '}
                      <strong className="text-foreground">{videoMeta.fps} FPS</strong>
                    </div>
                    <div>
                      <span className="text-muted">Duration:</span>{' '}
                      <strong className="text-foreground">{formatSeconds(videoMeta.durationSeconds)}</strong>
                    </div>
                    <div>
                      <span className="text-muted">Frames:</span>{' '}
                      <strong className="text-foreground">{videoMeta.frameCount.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              )}

              {probeError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-3 text-xs text-red-400">
                  <AlertCircle className="inline mr-1 size-4" />
                  {probeError}
                </div>
              )}
            </div>

            {/* Step 2: Model Selection */}
            <div className="mt-8 space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">2. AI Enhancement Model</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {models.map((m) => {
                  const isSelected = selectedModelId === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedModelId(m.id)}
                      className={cn(
                        'cursor-pointer rounded-2xl border p-4 transition',
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-md ring-1 ring-emerald-500/30'
                          : 'border-border bg-card-2 hover:border-border/80 hover:bg-card',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-bold text-foreground">{m.displayName}</span>
                        <span className="rounded-md bg-card px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          {m.scale}x Scale
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted line-clamp-2">
                        {m.category === 'anime-restoration' ? 'Deep neural line reconstruction and halo removal' : 'Fast real-time playback enhancer'}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted font-mono">
                        <span>{m.architecture.toUpperCase()}</span>
                        <span>•</span>
                        <span>{m.license}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Step 3: Target Output Resolution */}
            <div className="mt-8 space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">3. Target Output Resolution</label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['1080p', '1440p', '4k', '8k'] as const).map((res) => {
                  const isSelected = targetResolution === res
                  const isLocked =
                    (res === '8k' && !is8KAllowed) || (res === '4k' && !is4KAllowed)
                  return (
                    <button
                      key={res}
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleResolutionChange(res)}
                      className={cn(
                        'relative flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition',
                        isLocked && 'cursor-not-allowed opacity-40',
                        isSelected && !isLocked
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30'
                          : 'border-border bg-card-2 text-foreground hover:bg-card',
                      )}
                    >
                      <span className="font-display text-lg font-bold">{res.toUpperCase()}</span>
                      <span className="text-[10px] text-muted">
                        {res === '1080p' && '1920x1080 Full HD'}
                        {res === '1440p' && '2560x1440 2K QHD'}
                        {res === '4k' && '3840x2160 Ultra HD'}
                        {res === '8k' && '7680x4320 High-Res'}
                      </span>
                      {isLocked && (
                        <span className="mt-1 text-[9px] text-yellow-400">Requires Advanced GPU</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 4: Output File Destination */}
            <div className="mt-8 space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">4. Output Destination</label>
              <input
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                placeholder="/path/to/enhanced_output.mp4"
                className="w-full rounded-xl border border-border bg-card-2 px-4 py-2.5 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Submit Action */}
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={handleCreateJob}
                disabled={submitting || !inputPath.trim()}
                className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                {submitting ? 'Adding to Queue...' : 'Queue Enhancement Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MODEL LIBRARY */}
      {activeTab === 'models' && (
        <div className="mt-8 space-y-6">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <h2 className="font-display text-xl font-bold text-foreground">Registered Model Manifests</h2>
            <p className="mt-1 text-xs text-muted">
              Official neural network models certified for Zenkai Vision. Cryptographically verified against SHA-256 manifests.
            </p>

            <div className="mt-6 divide-y divide-border/60">
              {models.map((m) => {
                const ver = verificationMap[m.id]
                const bm = benchmarkMap[m.id]
                const isVerifying = verifyingId === m.id
                const isBenchmarking = benchmarkingId === m.id

                return (
                  <div key={m.id} className="py-5 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-bold text-foreground">{m.displayName}</h3>
                          <span className="rounded bg-card-2 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-400">
                            {m.scale}x Upscale
                          </span>
                        </div>
                        <p className="text-xs text-muted font-mono">{m.id} • {m.architecture.toUpperCase()} • License: {m.license}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleVerify(m.id)}
                          disabled={isVerifying}
                          className="flex items-center gap-1.5 rounded-xl border border-border bg-card-2 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card disabled:opacity-50"
                        >
                          <CheckCircle2 className="size-3.5 text-accent" />
                          {isVerifying ? 'Verifying...' : 'Verify SHA-256'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBenchmark(m.id)}
                          disabled={isBenchmarking}
                          className="flex items-center gap-1.5 rounded-xl border border-border bg-card-2 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card disabled:opacity-50"
                        >
                          <Cpu className="size-3.5 text-emerald-400" />
                          {isBenchmarking ? 'Testing...' : 'Benchmark'}
                        </button>
                      </div>
                    </div>

                    {ver && (
                      <div className="rounded-xl border border-border bg-card-2/60 p-2.5 text-xs">
                        {ver.valid ? (
                          <span className="text-emerald-400 font-medium">✓ SHA-256 Verified: {ver.actualSha256?.substring(0, 16)}...</span>
                        ) : (
                          <span className="text-yellow-400 font-medium">Model weights pending download ({ver.error})</span>
                        )}
                      </div>
                    )}

                    {bm && (
                      <div className="rounded-xl border border-border bg-card-2/60 p-2.5 text-xs">
                        <span className="text-emerald-400 font-medium">
                          Benchmark Result: {bm.latencyMs}ms latency • {bm.memoryMb}MB RAM • Provider: {bm.provider.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: VISUAL COMPARISON SLIDER */}
      {activeTab === 'compare' && (
        <div className="mt-8 space-y-6">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <h2 className="font-display text-xl font-bold text-foreground">Visual Quality Comparison</h2>
            <p className="mt-1 text-xs text-muted">
              Interactive split-screen demonstration comparing standard interpolation vs Zenkai Vision AI Super-Resolution.
            </p>

            <div
              ref={sliderRef}
              onMouseMove={handleSliderMove}
              onTouchMove={handleSliderMove}
              className="relative mt-6 h-[480px] w-full cursor-ew-resize select-none overflow-hidden rounded-2xl border border-border bg-black shadow-2xl"
            >
              {/* After: AI Enhanced View (Background full width) */}
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                <div className="relative size-full flex items-center justify-center overflow-hidden">
                  <div className="text-center space-y-2 p-8">
                    <div className="inline-flex size-24 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40 shadow-2xl">
                      <Sparkles className="size-12" />
                    </div>
                    <h4 className="font-display text-2xl font-black tracking-tight text-white">
                      Zenkai Vision 4K AI Upscaled
                    </h4>
                    <p className="text-sm text-emerald-300 font-medium max-w-md">
                      Clean line edges, artifact removal, crisp textures & high dynamic range recovery.
                    </p>
                  </div>
                </div>
              </div>

              {/* Before: Standard View (Clipped by sliderPos) */}
              <div
                className="absolute inset-y-0 left-0 overflow-hidden bg-zinc-900 filter blur-[1px] opacity-90 border-r-2 border-emerald-400"
                style={{ width: `${sliderPos}%` }}
              >
                <div className="relative h-full w-[800px] flex items-center justify-center">
                  <div className="text-center space-y-2 p-8">
                    <div className="inline-flex size-24 items-center justify-center rounded-3xl bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700">
                      <Film className="size-12" />
                    </div>
                    <h4 className="font-display text-2xl font-black tracking-tight text-zinc-400">
                      Original 720p Source
                    </h4>
                    <p className="text-sm text-zinc-500 font-medium max-w-md">
                      Visible pixelation, block compression artifacts and soft anime line art.
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider Handle */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 -left-3.5 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-emerald-400 text-black shadow-lg">
                  <Sliders className="size-4" />
                </div>
              </div>

              {/* Labels */}
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-black/70 px-3 py-1 text-xs font-bold text-zinc-400 backdrop-blur">
                Before: Original 720p
              </div>
              <div className="pointer-events-none absolute bottom-4 right-4 rounded-lg bg-emerald-950/80 px-3 py-1 text-xs font-bold text-emerald-300 backdrop-blur ring-1 ring-emerald-500/30">
                After: Zenkai Vision 4K AI
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
