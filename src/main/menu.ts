import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";
import { loadStandaloneUI, loadWebPortal } from "./window";

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
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
