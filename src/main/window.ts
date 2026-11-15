import { BrowserWindow } from "electron";
import { join } from "node:path";
import { WEB_URL } from "../shared/config";
import { getSettings, updateSettings } from "./settings";

export function createMainWindow(): BrowserWindow {
  const state = getSettings().windowState;
  const win = new BrowserWindow({
    x: state?.x,
    y: state?.y,
    width: state?.width ?? 1280,
    height: state?.height ?? 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  if (state?.maximized) win.maximize();

  // T5: persist window state for restore on next launch.
  win.on("close", () => {
    if (!win.isDestroyed()) {
      updateSettings({
        windowState: { ...win.getBounds(), maximized: win.isMaximized() },
      });
    }
  });

  win.once("ready-to-show", () => win.show());
  void win.loadURL(WEB_URL);
  return win;
}
