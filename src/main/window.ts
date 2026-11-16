import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import { join } from "node:path";
import { WEB_URL } from "../shared/config";
import { getSettings, updateSettings } from "./settings";
import { getActiveRendererPath, setupCanaryHealthCheck } from "./renderer-updater";

export function getAppIconPath(): string | undefined {
  const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
  if (app.isPackaged) {
    const packagedResource = join(process.resourcesPath, iconName);
    if (fs.existsSync(packagedResource)) return packagedResource;
  }
  const localResource = join(__dirname, "../../resources", iconName);
  if (fs.existsSync(localResource)) return localResource;

  const pngFallback = join(__dirname, "../../resources/icon.png");
  if (fs.existsSync(pngFallback)) return pngFallback;

  const logoPng = join(__dirname, "../../public/logo.png");
  if (fs.existsSync(logoPng)) return logoPng;

  return undefined;
}

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
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    x: state?.x,
    y: state?.y,
    width: state?.width ?? 1280,
    height: state?.height ?? 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: iconPath,
    autoHideMenuBar: true,
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
    setupCanaryHealthCheck(win, target.path);
    void win.loadFile(target.path);
  } else {
    void win.loadURL(target.path);
  }

  if (process.platform !== "darwin") {
    win.removeMenu();
  }

  // OS-level mouse button (mouse 4 / 5) and multimedia back/forward support
  win.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") {
      if (win.webContents.canGoBack()) {
        win.webContents.goBack();
      }
    } else if (cmd === "browser-forward") {
      if (win.webContents.canGoForward()) {
        win.webContents.goForward();
      }
    }
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (
      (input.control || input.meta) &&
      input.key.toLowerCase() === "r"
    ) {
      win.webContents.reload();
      event.preventDefault();
    } else if (input.alt && input.key === "ArrowLeft") {
      if (win.webContents.canGoBack()) {
        win.webContents.goBack();
        event.preventDefault();
      }
    } else if (input.alt && input.key === "ArrowRight") {
      if (win.webContents.canGoForward()) {
        win.webContents.goForward();
        event.preventDefault();
      }
    } else if (
      !app.isPackaged &&
      (input.control || input.meta) &&
      input.shift &&
      input.key.toLowerCase() === "i"
    ) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  return win;
}
