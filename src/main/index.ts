import { app, BrowserWindow, globalShortcut } from "electron";
import { log } from "./logger";
import "./ipc";
import { buildMenu } from "./menu";
import { registerPlayback } from "./playback";
import { registerPower } from "./power";
import { findDeepLink, handleDeepLink, registerProtocol } from "./protocol";
import { registerSecurity } from "./security";
import { createTray } from "./tray";
import { setupAutoUpdater } from "./updater";
import { createMainWindow } from "./window";
import { configureGpuSwitches } from "./gpu";
import { getSettings } from "./settings";

log.main.info("========================================================");
log.main.info(`Starting Zenkai Desktop v${app.getVersion() || "0.0.1"}`);
log.main.info(
  `OS: ${process.platform} (${process.arch}) | Electron: ${process.versions.electron} | Chromium: ${process.versions.chrome} | Node: ${process.versions.node}`,
);
log.main.info(
  `Environment: ${app.isPackaged ? "Production (Packaged)" : "Development (Source)"}`,
);
log.main.info("========================================================");

// Hardware acceleration and WebGPU enablement driven by platform and user settings
const initialSettings = getSettings();
configureGpuSwitches(initialSettings);

// T11: must run before app ready (single-instance lock + protocol registration).
registerProtocol();

function setupWindow(): BrowserWindow {
  const win = createMainWindow();
  registerPlayback(win);
  registerPower(win);
  return win;
}

app.whenReady().then(() => {
  log.main.info("Electron app ready event fired — initializing services");
  registerSecurity();
  setupWindow();
  buildMenu();
  createTray();
  setupAutoUpdater();

  // first instance launched directly with a zenkai:// link
  const initial = findDeepLink(process.argv);
  if (initial) {
    log.main.info("Launched with deep link argument:", initial);
    handleDeepLink(initial);
  }

  // B8: Global quick-summon hotkey
  try {
    globalShortcut.register("CommandOrControl+Shift+Z", () => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        log.main.debug("Global quick-summon shortcut triggered (Ctrl+Shift+Z)");
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
    log.main.debug("Registered global shortcut: CommandOrControl+Shift+Z");
  } catch (err) {
    log.main.warn("Failed to register global quick-summon shortcut:", err);
  }

  app.on("activate", () => {
    log.main.debug("App activated (macOS/dock)");
    if (BrowserWindow.getAllWindows().length === 0) setupWindow();
  });
});

app.on("will-quit", () => {
  log.main.info("Application will quit — unregistering shortcuts");
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  log.main.info("All windows closed");
  if (process.platform !== "darwin") app.quit();
});
