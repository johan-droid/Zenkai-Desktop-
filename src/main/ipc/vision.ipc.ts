import { ipcMain } from 'electron';
import { z } from 'zod';
import { getCompleteHardwareProfile } from '../vision/qualification';
import { runVisionDiagnostics } from '../vision/diagnostics';
import { visionWorker } from '../vision/worker-manager';
import { getAllModels } from '../vision/models/registry';
import { verifyModelFile } from '../vision/models/verifier';
import { VisionInferenceEngine } from '../vision/engine/inference-engine';

const NoInput = z.undefined();
const ModelIdInput = z.string().min(1).max(100);
const BenchmarkInput = z.object({
  modelId: z.string().min(1).max(100),
  provider: z.enum(['cuda', 'tensorrt', 'directml', 'openvino', 'coreml', 'webgpu', 'cpu']).optional(),
});

const benchmarkEngine = new VisionInferenceEngine();

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


