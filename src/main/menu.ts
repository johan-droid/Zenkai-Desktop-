import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { loadStandaloneUI, loadWebPortal } from "./window";
import { checkForUpdatesManual } from "./updater";

export function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

// T7: native menu. §8.3 accelerators that the web layer CANNOT receive live
// here (fullscreen, reload, devtools). Standalone / Web Portal switchers added
// for instant access.
export function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: "appMenu" as const }, { role: "editMenu" as const }]
      : []),
    {
      label: "View",
      submenu: [
        {
          id: "standalone-ui",
          label: "Switch to Standalone Desktop UI",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => {
            const w = targetWindow();
            if (w) loadStandaloneUI(w);
          },
        },
        {
          id: "web-portal",
          label: "Switch to Zenkai Web Portal",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => {
            const w = targetWindow();
            if (w) loadWebPortal(w);
          },
        },
        { type: "separator" },
        {
          id: "reload",
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => targetWindow()?.webContents.reload(),
        },
        {
          id: "fullscreen",
          label: "Fullscreen",
          accelerator: isMac ? "Ctrl+Cmd+F" : "F11",
          click: () => {
            const w = targetWindow();
            if (w) w.setFullScreen(!w.isFullScreen());
          },
        },
        { type: "separator" },
        {
          id: "devtools",
          label: "Toggle Developer Tools",
          accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I",
          visible: !app.isPackaged, // §8.3: DevTools is a dev-only accelerator
          click: () => targetWindow()?.webContents.toggleDevTools(),
        },
      ],
    },
    ...(isMac ? [{ role: "windowMenu" as const }] : []),
    {
      label: "Help",
      submenu: [
        {
          id: "check-updates",
          label: "Check for Updates...",
          click: () => {
            checkForUpdatesManual().catch((err) =>
              console.warn("[menu] check for updates error:", err),
            );
          },
        },
        { type: "separator" },
        {
          label: "Zenkai Desktop on GitHub",
          click: () => {
            shell.openExternal("https://github.com/johan-droid/Zenkai-Desktop-");
          },
        },
      ],
    },
  ];
  if (isMac) {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } else {
    Menu.setApplicationMenu(null);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.removeMenu();
      }
    }
  }
}
