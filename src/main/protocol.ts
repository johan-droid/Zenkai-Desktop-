import { app, BrowserWindow } from "electron";

// T11 — zenkai:// deep links (auth transport). B2 remains open: this is the
// plumbing (protocol registration, single-instance handoff, parse + forward);
// the upstream auth scheme/flow decision does not depend on it.

const PROTOCOL = "zenkai";

function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function findDeepLink(argv: readonly string[]): string | undefined {
  return argv.find((a) => a.startsWith(`${PROTOCOL}://`));
}

export function handleDeepLink(raw: string): void {
  let token: string | null = null;
  try {
    const u = new URL(raw);
    if (u.protocol !== `${PROTOCOL}:`) return;
    token = u.searchParams.get("token");
  } catch {
    // never log the raw URL or the error message — both can carry the token
    console.log("[protocol] malformed deep link ignored");
    return;
  }
  focusMainWindow();
  if (token && token.length > 0) {
    console.log("[protocol] auth link received (token redacted)");
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("auth:callback", { token });
    }
  } else {
    console.log("[protocol] deep link received (no token)");
  }
}

export function registerProtocol(): void {
  if (!app.setAsDefaultProtocolClient(PROTOCOL)) {
    console.warn(
      `[protocol] could not register ${PROTOCOL}:// handler (expected in dev; packaged builds register via OS)`,
    );
  }

  // Single instance: second instance passes its argv via 'second-instance'.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on("second-instance", (_e, argv) => {
    const url = findDeepLink(argv);
    if (url) handleDeepLink(url);
    else focusMainWindow(); // plain relaunch while running → just focus
  });

  // macOS delivers links via open-url instead of argv.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}
