import { app, BrowserWindow, Menu, Tray } from "electron";
import fs from "node:fs";
import { join } from "node:path";
import { dispatchWebKey } from "./playback";
import { targetWindow } from "./menu";

let tray: Tray | null = null;

export function createTray(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "tray.png")
    : join(__dirname, "../../resources/tray.png");

  if (!fs.existsSync(iconPath)) {
    console.warn(`[tray] icon not found at ${iconPath}, tray disabled`);
    return;
  }

  try {
    tray = new Tray(iconPath);
    tray.setToolTip("Zenkai");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Show",
          click: () => {
            const w = targetWindow();
            if (w) {
              w.show();
              w.focus();
            }
          },
        },
        {
          label: "Play/Pause",
          click: () => {
            const w = targetWindow();
            if (w) dispatchWebKey(w, { key: " ", code: "Space" });
          },
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
    console.log("[tray] created");
  } catch (err) {
    // Linux without AppIndicator / tray unsupported → warn, skip, no crash.
    console.warn(
      "[tray] unsupported on this system, skipping:",
      err instanceof Error ? err.message : err,
    );
    tray = null;
  }
}
