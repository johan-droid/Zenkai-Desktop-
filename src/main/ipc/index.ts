import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { log } from "../logger";

// Intercept ipcMain.handle to log all incoming IPC messages in the terminal
const originalHandle = ipcMain.handle.bind(ipcMain);
(ipcMain as unknown as { handle: typeof originalHandle }).handle = (
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
) => {
  return originalHandle(channel, async (event, ...args) => {
    const start = Date.now();
    log.ipc.debug(`-> [${channel}]`, args.length > 0 ? args[0] : "");
    try {
      const result = await listener(event, ...args);
      const elapsed = Date.now() - start;
      log.ipc.debug(`<- [${channel}] OK (${elapsed}ms)`);
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      log.ipc.error(
        `<- [${channel}] FAILED (${elapsed}ms):`,
        (err as Error)?.message || err,
      );
      throw err;
    }
  });
};

// Side-effect registration of all IPC handlers. Add one import per *.ipc.ts file.
import "./app.ipc";
import "./downloads.ipc";
import "./rpc.ipc";
import "./settings.ipc";
import "./updater.ipc";
import "./playback.ipc";
import "./open-file.ipc";
import "./vision.ipc";
import "./gpu.ipc";
import { registerWindowIpc } from "./window.ipc";

registerWindowIpc();
