import { app, BrowserWindow } from "electron";
import "./ipc";
import { buildMenu } from "./menu";
import { registerPlayback } from "./playback";
import { registerPower } from "./power";
import { findDeepLink, handleDeepLink, registerProtocol } from "./protocol";
import { registerSecurity } from "./security";
import { createTray } from "./tray";
import { setupAutoUpdater } from "./updater";
import { createMainWindow } from "./window";

// T11: must run before app ready (single-instance lock + protocol registration).
registerProtocol();

function setupWindow(): BrowserWindow {
  const win = createMainWindow();
  registerPlayback(win);
  registerPower(win);
  return win;
}

app.whenReady().then(() => {
  registerSecurity();
  setupWindow();
  buildMenu();
  createTray();
  setupAutoUpdater();

  // first instance launched directly with a zenkai:// link
  const initial = findDeepLink(process.argv);
  if (initial) handleDeepLink(initial);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) setupWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
