import { ipcMain, shell } from "electron";
import { z } from "zod";

const OpenFileInput = z.string().min(1);

ipcMain.handle("app:openFile", async (_e, raw: unknown) => {
  const parsed = OpenFileInput.safeParse(raw);
  if (!parsed.success) {
    console.error("[ipc] invalid payload for app:openFile");
    throw new Error("invalid payload for app:openFile");
  }

  const normalized = parsed.data.replace(/^file:\/\//i, "").replace(/^\/+/, "/");
  await shell.openPath(normalized);
});
