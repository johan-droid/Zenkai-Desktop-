import { ipcMain } from "electron";
import { getSettings } from "../settings";
import { getGpuDiagnostics } from "../gpu";
import type { UnifiedGpuDiagnostics } from "../../shared/gpu-types";

ipcMain.handle("gpu:getDiagnostics", async (): Promise<UnifiedGpuDiagnostics> => {
  let settings;
  try {
    settings = getSettings();
  } catch {
    settings = {};
  }
  return getGpuDiagnostics(settings);
});

