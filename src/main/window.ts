import { BrowserWindow } from "electron";
import fs from "node:fs";
import { join } from "node:path";
import { WEB_URL } from "../shared/config";
import { getSettings, updateSettings } from "./settings";
import { getActiveRendererPath } from "./renderer-updater";

export function getAppEntryTarget(): { type: "url" | "file"; path: string } {
  const customUrl = process.env.ZENKAI_WEB_URL;
  if (customUrl) {
    return { type: "url", path: customUrl };
  }
  if (process.env.ZENKAI_MODE === "web") {
    return { type: "url", path: WEB_URL };
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    return { type: "url", path: process.env.ELECTRON_RENDERER_URL };
  }
  const rendererPath = getActiveRendererPath();
  if (fs.existsSync(rendererPath)) {
    return { type: "file", path: rendererPath };
  }
  return { type: "url", path: WEB_URL };
}

export function loadStandaloneUI(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

export function loadWebPortal(win: BrowserWindow): void {
  void win.loadURL(WEB_URL);
}

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
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 14 } : undefined,
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

  win.on("close", () => {
    if (!win.isDestroyed()) {
      updateSettings({
        windowState: { ...win.getBounds(), maximized: win.isMaximized() },
      });
    }
  });

  win.once("ready-to-show", () => win.show());

  const target = getAppEntryTarget();
  if (target.type === "file") {
    void win.loadFile(target.path);
  } else {
    void win.loadURL(target.path);
  }

  return win;
}
