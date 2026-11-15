import { app, ipcMain } from "electron";
import { z } from "zod";

const Input = z.undefined();

// §7.3 pattern: validate first, then act. Invalid payload → log + throw
// (renderer's invoke() rejects; main keeps running).
ipcMain.handle("app:version", async (_e, raw: unknown) => {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    console.error("[ipc] invalid payload for app:version");
    throw new Error("invalid payload for app:version");
  }
  return app.getVersion();
});
