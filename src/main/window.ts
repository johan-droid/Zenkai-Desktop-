import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import { join } from "node:path";
import { WEB_URL } from "../shared/config";
import { getSettings, updateSettings } from "./settings";
import { getActiveRendererPath, setupCanaryHealthCheck } from "./renderer-updater";
import { log } from "./logger";

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
    backgroundColor: "#050506",
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

  win.once("ready-to-show", () => {
    log.window.info("Main window ready to show — making visible");
    win.show();
  });

  const target = getAppEntryTarget();
  log.window.info(`Loading UI entry target: [${target.type}] ${target.path}`);

  win.webContents.on("did-finish-load", () => {
    log.window.success(`UI loaded successfully: ${win.webContents.getURL()}`);
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    log.window.error(`UI load failure: ${url} (${desc}, code ${code})`);
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    log.window.error(
      `Renderer process terminated unexpectedly: reason=${details.reason}, exitCode=${details.exitCode}`,
    );
  });

  // Forward renderer console logs to terminal using single event parameter signature
  win.webContents.on("console-message", (event: any) => {
    const isEventObj = event && typeof event === "object" && typeof event.message === "string";
    const level: number = isEventObj ? (event.level ?? 0) : 0;
    const message: string = isEventObj ? (event.message ?? "") : "";
    const line: number = isEventObj ? (event.lineNumber ?? event.line ?? 0) : 0;
    const sourceId: string = isEventObj ? (event.sourceId ?? "") : "";

    if (
      message.includes("Download the React DevTools") ||
      message.includes("React Router Future Flag")
    ) {
      return;
    }
    const shortSrc = sourceId ? sourceId.split("/").pop()?.split("?")[0] : "";
    const loc = shortSrc ? ` (${shortSrc}:${line})` : "";
    if (level === 3) {
      log.ui.error(`${message}${loc}`);
    } else if (level === 2) {
      log.ui.warn(`${message}${loc}`);
    } else if (level === 1) {
      log.ui.info(`${message}${loc}`);
    } else {
      log.ui.debug(`${message}${loc}`);
    }
  });

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
