import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { getCompleteHardwareProfile } from '../vision/qualification';
import { runVisionDiagnostics } from '../vision/diagnostics';
import { visionWorker } from '../vision/worker-manager';
import { getAllModels } from '../vision/models/registry';
import { verifyModelFile } from '../vision/models/verifier';
import { VisionInferenceEngine } from '../vision/engine/inference-engine';
import { probeVideo } from '../vision/media/ffmpeg-pipeline';
import { visionJobManager } from '../vision/jobs/job-manager';

const NoInput = z.undefined();
const ModelIdInput = z.string().min(1).max(100);
const FilePathInput = z.string().min(1).max(1024);
const JobIdInput = z.string().min(1).max(100);

const BenchmarkInput = z.object({
  modelId: z.string().min(1).max(100),
  provider: z.enum(['cuda', 'tensorrt', 'directml', 'openvino', 'coreml', 'webgpu', 'cpu']).optional(),
});

const CreateJobInput = z.object({
  inputPath: z.string().min(1).max(1024),
  outputPath: z.string().min(1).max(1024),
  modelId: z.string().min(1).max(100),
  targetResolution: z.enum(['1080p', '1440p', '4k', '8k']),
  tileSize: z.number().int().min(128).max(2048).optional(),
  tileOverlap: z.number().int().min(0).max(128).optional(),
  encoder: z.enum(['auto', 'nvenc', 'vaapi', 'amf', 'videotoolbox', 'libx264', 'libx265']).optional(),
  crf: z.number().int().min(0).max(51).optional(),
  audioMode: z.enum(['passthrough', 'aac', 'none']).optional(),
  subtitlesMode: z.enum(['passthrough', 'none']).optional(),
  preserveMetadata: z.boolean().optional(),
});

const benchmarkEngine = new VisionInferenceEngine();

// Broadcast job updates to renderer windows
visionJobManager.onProgress((progress) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('vision:jobProgress', progress);
    }
  }
});

visionJobManager.onJobListChanged((jobs) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('vision:jobListChanged', jobs);
    }
  }
});

ipcMain.handle('vision:getHardwareProfile', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:getHardwareProfile');
  }
  return getCompleteHardwareProfile();
});

ipcMain.handle('vision:runDiagnostics', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:runDiagnostics');
  }
  return await runVisionDiagnostics();
});

ipcMain.handle('vision:getWorkerStatus', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:getWorkerStatus');
  }
  return visionWorker.getStatus();
});

ipcMain.handle('vision:startWorker', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:startWorker');
  }
  return await visionWorker.start();
});

ipcMain.handle('vision:stopWorker', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:stopWorker');
  }
  return await visionWorker.stop();
});

ipcMain.handle('vision:getModels', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:getModels');
  }
  return getAllModels();
});

ipcMain.handle('vision:verifyModel', async (_e, raw: unknown) => {
  const parsed = ModelIdInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:verifyModel');
  }
  return await verifyModelFile(parsed.data);
});

ipcMain.handle('vision:runBenchmark', async (_e, raw: unknown) => {
  const parsed = BenchmarkInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:runBenchmark');
  }
  return await benchmarkEngine.runBenchmark(parsed.data.modelId, parsed.data.provider);
});

ipcMain.handle('vision:probeVideo', async (_e, raw: unknown) => {
  const parsed = FilePathInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:probeVideo');
  }
  return await probeVideo(parsed.data);
});

ipcMain.handle('vision:getJobs', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:getJobs');
  }
  return visionJobManager.getJobs();
});

ipcMain.handle('vision:createJob', async (_e, raw: unknown) => {
  const parsed = CreateJobInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`invalid payload for vision:createJob: ${parsed.error.message}`);
  }
  return await visionJobManager.createJob(parsed.data);
});

ipcMain.handle('vision:pauseJob', async (_e, raw: unknown) => {
  const parsed = JobIdInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:pauseJob');
  }
  return await visionJobManager.pauseJob(parsed.data);
});

ipcMain.handle('vision:resumeJob', async (_e, raw: unknown) => {
  const parsed = JobIdInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:resumeJob');
  }
  return await visionJobManager.resumeJob(parsed.data);
});

ipcMain.handle('vision:cancelJob', async (_e, raw: unknown) => {
  const parsed = JobIdInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:cancelJob');
  }
  return await visionJobManager.cancelJob(parsed.data);
});

ipcMain.handle('vision:deleteJob', async (_e, raw: unknown) => {
  const parsed = JobIdInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:deleteJob');
  }
  return await visionJobManager.deleteJob(parsed.data);
});

ipcMain.handle('vision:clearCompletedJobs', async (_e, raw: unknown) => {
  const parsed = NoInput.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid payload for vision:clearCompletedJobs');
  }
  await visionJobManager.clearCompletedJobs();
});
