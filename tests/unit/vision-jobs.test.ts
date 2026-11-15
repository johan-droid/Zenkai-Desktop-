import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VisionJobManager } from '../../src/main/vision/jobs/job-manager';
import type { VisionJobOptions } from '../../src/shared/vision-jobs';

describe('Zenkai Vision Job Manager', () => {
  let tmpDir: string;
  let storageFile: string;
  let testVideoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-job-manager-test-'));
    storageFile = path.join(tmpDir, 'vision-jobs.json');
    testVideoPath = path.join(tmpDir, 'sample_anime.mp4');
    fs.writeFileSync(testVideoPath, 'dummy-video-data');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes with empty jobs list when no storage file exists', () => {
    const manager = new VisionJobManager(storageFile);
    expect(manager.getJobs()).toEqual([]);
  });

  it('rejects job creation if input file does not exist', async () => {
    const manager = new VisionJobManager(storageFile);
    const opts: VisionJobOptions = {
      inputPath: path.join(tmpDir, 'nonexistent.mp4'),
      outputPath: path.join(tmpDir, 'out.mp4'),
      modelId: 'compact3-anime-fast',
      targetResolution: '1080p',
    };

    await expect(manager.createJob(opts)).rejects.toThrow('Input video file not found');
  });

  it('rejects job creation if model is not registered', async () => {
    const manager = new VisionJobManager(storageFile);
    const opts: VisionJobOptions = {
      inputPath: testVideoPath,
      outputPath: path.join(tmpDir, 'out.mp4'),
      modelId: 'invalid-model-id',
      targetResolution: '1080p',
    };

    await expect(manager.createJob(opts)).rejects.toThrow('Invalid model specified');
  });

  it('handles pause, resume and cancel transitions for queued jobs', async () => {
    const manager = new VisionJobManager(storageFile);

    // Mock probeVideo to return immediately without spawning child processes
    vi.spyOn(manager as any, 'processQueue').mockImplementation(() => Promise.resolve());

    const job = await manager.createJob({
      inputPath: testVideoPath,
      outputPath: path.join(tmpDir, 'out.mp4'),
      modelId: 'compact3-anime-fast',
      targetResolution: '1080p',
    });

    expect(job.status).toBe('queued');
    expect(job.progress.status).toBe('queued');

    // Pause job
    const pauseRes = await manager.pauseJob(job.id);
    expect(pauseRes).toBe(true);
    expect(manager.getJob(job.id)?.status).toBe('paused');

    // Resume job
    const resumeRes = await manager.resumeJob(job.id);
    expect(resumeRes).toBe(true);
    expect(manager.getJob(job.id)?.status).toBe('queued');

    // Cancel job
    const cancelRes = await manager.cancelJob(job.id);
    expect(cancelRes).toBe(true);
    expect(manager.getJob(job.id)?.status).toBe('cancelled');
  });

  it('persists and restores jobs across multiple manager instances', async () => {
    const manager1 = new VisionJobManager(storageFile);
    vi.spyOn(manager1 as any, 'processQueue').mockImplementation(() => Promise.resolve());

    const created = await manager1.createJob({
      inputPath: testVideoPath,
      outputPath: path.join(tmpDir, 'out.mp4'),
      modelId: 'real-esrgan-animevideo-v3',
      targetResolution: '4k',
    });

    expect(fs.existsSync(storageFile)).toBe(true);

    // Create second instance reading from same storage file
    const manager2 = new VisionJobManager(storageFile);
    const loadedJobs = manager2.getJobs();
    expect(loadedJobs.length).toBe(1);
    expect(loadedJobs[0].id).toBe(created.id);
    expect(loadedJobs[0].options.targetResolution).toBe('4k');
  });

  it('deletes job and clears completed/cancelled jobs correctly', async () => {
    const manager = new VisionJobManager(storageFile);
    vi.spyOn(manager as any, 'processQueue').mockImplementation(() => Promise.resolve());

    const job = await manager.createJob({
      inputPath: testVideoPath,
      outputPath: path.join(tmpDir, 'out.mp4'),
      modelId: 'compact3-anime-fast',
      targetResolution: '1080p',
    });

    await manager.cancelJob(job.id);
    expect(manager.getJobs().length).toBe(1);

    await manager.clearCompletedJobs();
    expect(manager.getJobs().length).toBe(0);
  });
});

