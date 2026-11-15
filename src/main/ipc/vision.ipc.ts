import { ipcMain } from 'electron';
import { z } from 'zod';
import { getCompleteHardwareProfile } from '../vision/qualification';
import { runVisionDiagnostics } from '../vision/diagnostics';
import { visionWorker } from '../vision/worker-manager';

const NoInput = z.undefined();

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
