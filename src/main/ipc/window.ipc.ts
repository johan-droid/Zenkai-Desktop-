import { BrowserWindow, ipcMain, shell } from "electron";
import { loadWebPortal } from "../window";

export function registerWindowIpc(): void {
  ipcMain.on("window:loadWebPortal", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      loadWebPortal(win);
      return;
    }

    const anyWin = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed(),
    );
    if (anyWin) {
      loadWebPortal(anyWin);
      return;
    }

    shell.openExternal(
      process.env.ZENKAI_WEB_URL ?? "https://zenkai-web.pages.dev/",
    );
  });
}

