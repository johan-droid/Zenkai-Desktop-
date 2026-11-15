import { BrowserWindow, Notification } from "electron";

// T10 — main-owned notifications (renderer keeps its own HTML5 path via the
// granted 'notifications' permission; §7.1 defines no renderer→main notify
// channel, so there is deliberately no notify.ipc.ts).

let unsupportedLogged = false;

export function showNotification(p: {
  id: string;
  title: string;
  body?: string;
}): void {
  // Linux without libnotify → no-op, log once (spec T10 step 3)
  if (!Notification.isSupported()) {
    if (!unsupportedLogged) {
      unsupportedLogged = true;
      console.warn(
        "[notify] notifications unsupported on this system (libnotify missing on Linux?) — skipping",
      );
    }
    return;
  }

  const n = new Notification({ title: p.title, body: p.body, silent: false }); // step 1
  n.on("click", () => {
    // step 2: focus window, then forward the payload to the renderer
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send("notify:click", { id: p.id });
    }
  });
  n.show();
  console.log(`[notify] shown: ${p.id}`);
}
