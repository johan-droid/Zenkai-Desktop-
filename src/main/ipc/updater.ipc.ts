import { ipcMain } from "electron";
import { z } from "zod";
import {
  checkForUpdatesClient,
  startUpdateDownload,
  applyUpdateAndRestart,
} from "../updater";

const VoidInput = z.undefined();

ipcMain.handle("updater:check", async (_e, raw: unknown) => {
  const parsed = VoidInput.safeParse(raw);
  if (!parsed.success) {
    console.error("[ipc] invalid payload for updater:check");
    throw new Error("invalid payload for updater:check");
  }
  return await checkForUpdatesClient();
});

ipcMain.handle("updater:start-download", async (_e, raw: unknown) => {
  const parsed = VoidInput.safeParse(raw);
  if (!parsed.success) {
    console.error("[ipc] invalid payload for updater:start-download");
    throw new Error("invalid payload for updater:start-download");
  }
  return await startUpdateDownload();
});

ipcMain.handle("updater:install", async (_e, raw: unknown) => {
  const parsed = VoidInput.safeParse(raw);
  if (!parsed.success) {
    console.error("[ipc] invalid payload for updater:install");
    throw new Error("invalid payload for updater:install");
  }
  return await applyUpdateAndRestart();
});
