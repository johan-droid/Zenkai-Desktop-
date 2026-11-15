import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  VisionJob,
  VisionJobOptions,
  VisionJobProgress,
  VisionJobStatus,
} from '../../../shared/vision-jobs';
import {
  probeVideo,
  computeTargetDimensions,
  selectEncoder,
  getAtomicTempPath,
  finalizeOutputFile,
  cleanupTempFile,
} from '../media/ffmpeg-pipeline';
import { getModelById } from '../models/registry';
import { visionWorker } from '../worker-manager';

export type JobProgressCallback = (progress: VisionJobProgress) => void;
export type JobListChangedCallback = (jobs: VisionJob[]) => void;

function resolveJobStorePath(): string {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'vision-jobs.json');
    }
  } catch {
    // Non-electron test environment
  }
  return path.join(os.homedir(), '.zenkai', 'vision-jobs.json');
}

export class VisionJobManager {
  private jobs: VisionJob[] = [];
  private activeJobId: string | null = null;
  private progressListeners: Set<JobProgressCallback> = new Set();
  private listListeners: Set<JobListChangedCallback> = new Set();
  private isProcessing = false;
  private storagePath: string;

  constructor(customStoragePath?: string) {
    this.storagePath = customStoragePath || resolveJobStorePath();
    this.loadJobs();

    // Listen for progress updates from worker
    visionWorker.onJobProgress((progress) => {
      this.updateJobProgress(progress);
    });
  }

  public getJobs(): VisionJob[] {
    return [...this.jobs];
  }

  public getJob(id: string): VisionJob | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  public getActiveJob(): VisionJob | undefined {
    if (!this.activeJobId) return undefined;
    return this.getJob(this.activeJobId);
  }

  public onProgress(cb: JobProgressCallback): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  public onJobListChanged(cb: JobListChangedCallback): () => void {
    this.listListeners.add(cb);
    return () => this.listListeners.delete(cb);
  }

  private emitProgress(progress: VisionJobProgress): void {
    for (const l of this.progressListeners) {
      try {
        l(progress);
      } catch {}
    }
  }

  private emitListChanged(): void {
    const cloned = this.getJobs();
    for (const l of this.listListeners) {
      try {
        l(cloned);
      } catch {}
    }
  }

  private loadJobs(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.jobs = parsed.map((j: VisionJob) => {
            // If the app closed while a job was processing, mark it paused so the user can resume
            if (j.status === 'processing') {
              return {
                ...j,
                status: 'paused',
                progress: { ...j.progress, status: 'paused', stage: 'probing' },
              };
            }
            return j;
          });
        }
      }
    } catch {
      this.jobs = [];
    }
  }

  private saveJobs(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.storagePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.jobs, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch {
      // Ignore write errors in restricted or test environments
    }
  }

  public async createJob(options: VisionJobOptions): Promise<VisionJob> {
    if (!options.inputPath || !fs.existsSync(options.inputPath)) {
      throw new Error(`Input video file not found: ${options.inputPath}`);
    }

    if (!options.outputPath) {
      throw new Error('Output path must be specified');
    }

    const model = getModelById(options.modelId);
    if (!model) {
      throw new Error(`Invalid model specified: ${options.modelId}`);
    }

    // Probe input file metadata
    const metadata = await probeVideo(options.inputPath);

    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: VisionJob = {
      id,
      status: 'queued',
      createdAt: Date.now(),
      options: { ...options },
      metadata,
      progress: {
        jobId: id,
        status: 'queued',
        currentFrame: 0,
        totalFrames: metadata.frameCount,
        percent: 0,
        currentFps: 0,
        etaSeconds: 0,
        elapsedSeconds: 0,
        stage: 'probing',
      },
    };

    this.jobs.push(job);
    this.saveJobs();
    this.emitListChanged();

    // Trigger queue processing asynchronously
    setTimeout(() => void this.processQueue(), 50);

    return job;
  }

  public async pauseJob(id: string): Promise<boolean> {
    const job = this.getJob(id);
    if (!job) return false;

    if (job.status === 'queued') {
      job.status = 'paused';
      job.progress.status = 'paused';
      this.saveJobs();
      this.emitListChanged();
      return true;
    }

    if (job.status === 'processing' && this.activeJobId === id) {
      job.status = 'paused';
      job.progress.status = 'paused';
      this.saveJobs();
      this.emitProgress(job.progress);
      this.emitListChanged();

      // Signal worker to pause or cancel active job
      try {
        await visionWorker.request('job:pause', { jobId: id }, 1000).catch(() => {});
      } catch {}

      this.activeJobId = null;
      this.isProcessing = false;

      // Process next queued job if available
      setTimeout(() => void this.processQueue(), 100);
      return true;
    }

    return false;
  }

  public async resumeJob(id: string): Promise<boolean> {
    const job = this.getJob(id);
    if (!job || job.status !== 'paused') return false;

    job.status = 'queued';
    job.progress.status = 'queued';
    this.saveJobs();
    this.emitListChanged();

    setTimeout(() => void this.processQueue(), 50);
    return true;
  }

  public async cancelJob(id: string): Promise<boolean> {
    const job = this.getJob(id);
    if (!job) return false;

    if (job.status === 'processing' && this.activeJobId === id) {
      try {
        await visionWorker.request('job:cancel', { jobId: id }, 1000).catch(() => {});
      } catch {}

      const tempPath = getAtomicTempPath(job.options.outputPath);
      cleanupTempFile(tempPath);

      this.activeJobId = null;
      this.isProcessing = false;
    }

    job.status = 'cancelled';
    job.progress.status = 'cancelled';
    this.saveJobs();
    this.emitProgress(job.progress);
    this.emitListChanged();

    // Process next queued job
    setTimeout(() => void this.processQueue(), 50);
    return true;
  }

  public async deleteJob(id: string): Promise<boolean> {
    const job = this.getJob(id);
    if (!job) return false;

    if (job.status === 'processing') {
      await this.cancelJob(id);
    }

    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.saveJobs();
    this.emitListChanged();
    return true;
  }

  public async clearCompletedJobs(): Promise<void> {
    this.jobs = this.jobs.filter(
      (j) => j.status === 'queued' || j.status === 'processing' || j.status === 'paused',
    );
    this.saveJobs();
    this.emitListChanged();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const nextJob = this.jobs.find((j) => j.status === 'queued');
    if (!nextJob) return;

    this.isProcessing = true;
    this.activeJobId = nextJob.id;
    nextJob.status = 'processing';
    nextJob.startedAt = Date.now();
    nextJob.progress.status = 'processing';
    nextJob.progress.stage = 'extracting';
    this.saveJobs();
    this.emitProgress(nextJob.progress);
    this.emitListChanged();

    try {
      await this.executeJob(nextJob);
      nextJob.status = 'completed';
      nextJob.completedAt = Date.now();
      nextJob.progress.status = 'completed';
      nextJob.progress.percent = 100;
      nextJob.progress.currentFrame = nextJob.progress.totalFrames;
      nextJob.progress.stage = 'completed';
      nextJob.progress.etaSeconds = 0;

      // Check final output size
      if (fs.existsSync(nextJob.options.outputPath)) {
        try {
          const st = fs.statSync(nextJob.options.outputPath);
          nextJob.outputFileSize = st.size;
        } catch {}
      }
    } catch (err: any) {
      const currentStatus = nextJob.status as VisionJobStatus;
      if (currentStatus !== 'cancelled' && currentStatus !== 'paused') {
        nextJob.status = 'failed';
        nextJob.completedAt = Date.now();
        nextJob.progress.status = 'failed';
        nextJob.progress.stage = 'failed';
        nextJob.progress.error = err?.message || 'Enhancement failed';

        // Clean up partial output
        const tempPath = getAtomicTempPath(nextJob.options.outputPath);
        cleanupTempFile(tempPath);
      }
    } finally {
      this.saveJobs();
      this.emitProgress(nextJob.progress);
      this.emitListChanged();
      this.activeJobId = null;
      this.isProcessing = false;

      // Continue queue
      setTimeout(() => void this.processQueue(), 100);
    }
  }

  /**
   * Executes the enhancement job pipeline via the isolated worker.
   */
  private async executeJob(job: VisionJob): Promise<void> {
    const model = getModelById(job.options.modelId);
    if (!model) throw new Error(`Model ${job.options.modelId} not found`);

    const inMeta = job.metadata || (await probeVideo(job.options.inputPath));
    const targetDims = computeTargetDimensions(
      inMeta.width,
      inMeta.height,
      job.options.targetResolution,
      model.scale,
    );

    const encoderInfo = selectEncoder(job.options.encoder, job.options.targetResolution);
    const tempOutputPath = getAtomicTempPath(job.options.outputPath);

    // Ensure worker is running
    const wStatus = visionWorker.getStatus();
    if (wStatus.state !== 'running') {
      const startRes = await visionWorker.start();
      if (!startRes.success) {
        throw new Error(`Vision background worker failed to start: ${startRes.message}`);
      }
    }

    const tStart = Date.now();

    // Delegate execution to worker process
    await new Promise<void>((resolve, reject) => {
      let isSettled = false;

      const unsubscribe = visionWorker.onStatusChange((status) => {
        if (status.state === 'crashed' && !isSettled) {
          isSettled = true;
          unsubscribe();
          reject(new Error(`Worker process crashed: ${status.lastError}`));
        }
      });

      // Send job payload to worker
      visionWorker
        .request('job:start', {
          jobId: job.id,
          inputPath: job.options.inputPath,
          outputPath: tempOutputPath,
          modelId: job.options.modelId,
          targetResolution: job.options.targetResolution,
          targetDimensions: targetDims,
          encoder: encoderInfo.encoder,
          extraArgs: encoderInfo.extraArgs,
          audioMode: job.options.audioMode || 'passthrough',
          totalFrames: inMeta.frameCount,
          fps: inMeta.fps,
        }, 3600000) // Up to 1 hour timeout per job
        .then((res: any) => {
          if (isSettled) return;
          isSettled = true;
          unsubscribe();

          if (res?.success) {
            // Atomic finalization: rename .part.mp4 to final outputPath
            finalizeOutputFile(tempOutputPath, job.options.outputPath);
            resolve();
          } else {
            cleanupTempFile(tempOutputPath);
            reject(new Error(res?.error || 'Worker enhancement failed'));
          }
        })
        .catch((err: any) => {
          if (isSettled) return;
          isSettled = true;
          unsubscribe();
          cleanupTempFile(tempOutputPath);
          reject(err);
        });
    });
  }

  /**
   * Updates progress for active job from worker event.
   */
  public updateJobProgress(update: Partial<VisionJobProgress> & { jobId: string }): void {
    const job = this.getJob(update.jobId);
    if (!job) return;

    Object.assign(job.progress, update);
    this.emitProgress(job.progress);
  }
}

// Global singleton instance
export const visionJobManager = new VisionJobManager();
