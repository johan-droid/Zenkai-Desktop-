import { app, BrowserWindow, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { showNotification } from "./notify";
import { readSettings } from "./settings";
import { join } from "node:path";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let latestUpdateResult: {
  updateAvailable: boolean;
  version?: string;
  channel?: string;
  releaseDate?: string;
  notes?: string;
  mandatory?: boolean;
  assetUrl?: string;
  reason?: string;
} | null = null;

function getSettingsPath(): string {
  const dir = app.getPath("userData");
  return join(dir, "settings.json");
}

function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function setupAutoUpdater(): void {
  // Don't run updater in development
  if (!app.isPackaged) {
    console.log("[updater] app is not packaged — skipping updater setup");
    return;
  }

  // macOS unsigned check (B4): unsigned builds cannot be updated securely
  if (process.platform === "darwin" && !process.env.APPLE_ID) {
    console.warn(
      "[updater] macOS build unsigned (B4) — auto-updater disabled for security",
    );
    return;
  }

  // Linux package detection:
  // AppImage supports in-place auto-update via APPIMAGE env.
  // Debian/RPM installations should be updated via package manager / release page.
  if (process.platform === "linux" && !process.env.APPIMAGE) {
    console.log(
      "[updater] running as native Linux package (.deb/.rpm) — auto-update via package manager or GitHub Releases",
    );
    return;
  }

  // LOCKED DECISION: Notify-first delivery (never silent download or force install)
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Determine channel (latest default; beta if version has -beta or user opted in)
  const settings = readSettings(getSettingsPath());
  const currentVersion = app.getVersion();

  if (settings.channel === "beta" || currentVersion.includes("-beta")) {
    autoUpdater.channel = "beta";
    autoUpdater.allowPrerelease = true;
  } else {
    autoUpdater.channel = "latest";
    autoUpdater.allowPrerelease = false;
  }

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for updates...");
    broadcastToWindows("updater:status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] update available: ${info.version}`);
    latestUpdateResult = {
      updateAvailable: true,
      version: info.version,
      releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : undefined,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    };

    broadcastToWindows("updater:status", {
      status: "available",
      version: info.version,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    });

    try {
      showNotification({
        id: `update-available-${info.version}`,
        title: "⚡ Zenkai Desktop Update Available",
        body: `Version v${info.version} is now available. Click to review and download.`,
      });
    } catch {
      // ignore
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] app is up to date");
    broadcastToWindows("updater:status", { status: "not-available" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    broadcastToWindows("updater:status", {
      status: "downloading",
      progress: progressObj.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] update downloaded: ${info.version}`);
    broadcastToWindows("updater:status", {
      status: "downloaded",
      version: info.version,
    });

    try {
      showNotification({
        id: `update-downloaded-${info.version}`,
        title: "⚡ Update Ready to Install",
        body: `Version v${info.version} is ready. Restart to apply update.`,
      });
    } catch {
      // ignore
    }
  });

  autoUpdater.on("error", (err) => {
    console.warn("[updater] update check error:", err.message);
    broadcastToWindows("updater:status", {
      status: "error",
      error: err.message,
    });
  });

  // Check on launch
  autoUpdater.checkForUpdates().catch((err) => {
    console.warn("[updater] initial check failed:", err.message);
  });

  // Recurring check every 6 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[updater] interval check failed:", err.message);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Check for updates via the update-control backend, falling back to GitHub API.
 */
export async function checkForUpdatesClient(): Promise<{
  updateAvailable: boolean;
  version?: string;
  channel?: string;
  releaseDate?: string;
  notes?: string;
  mandatory?: boolean;
  assetUrl?: string;
  reason?: string;
}> {
  const currentVersion = app.getVersion();
  const settings = readSettings(getSettingsPath());
  const channel = settings.channel;
  const installationId = settings.installationId;
  const serverUrl = settings.updateServerUrl || "https://update.zenkai.cfd";

  broadcastToWindows("updater:status", { status: "checking" });

  // 1. Try update-control backend service first
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url = `${serverUrl}/desktop/v1/updates/latest?platform=${process.platform}&arch=${process.arch}&channel=${channel}&version=${currentVersion}&installationId=${encodeURIComponent(installationId)}`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": `Zenkai-Desktop/${currentVersion}` },
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as {
        updateAvailable: boolean;
        version?: string;
        channel?: string;
        releaseDate?: string;
        mandatory?: boolean;
        notes?: string;
        asset?: { url: string };
        reason?: string;
      };

      if (data.updateAvailable && data.version) {
        latestUpdateResult = {
          updateAvailable: true,
          version: data.version,
          channel: data.channel,
          releaseDate: data.releaseDate,
          notes: data.notes,
          mandatory: data.mandatory,
          assetUrl: data.asset?.url,
        };

        broadcastToWindows("updater:status", {
          status: "available",
          version: data.version,
          notes: data.notes,
        });

        return latestUpdateResult;
      }
    }
  } catch (err) {
    console.log("[updater] update-control service unavailable, falling back to GitHub direct check");
  }

  // 2. Direct GitHub Releases API Fallback
  try {
    const res = await fetch(
      "https://api.github.com/repos/johan-droid/Zenkai-Desktop-/releases",
      { headers: { "User-Agent": `Zenkai-Desktop/${currentVersion}` } },
    );
    if (!res.ok) {
      return { updateAvailable: false, reason: "GitHub Releases check unavailable" };
    }

    const releases = (await res.json()) as Array<{
      tag_name: string;
      prerelease: boolean;
      draft: boolean;
      body: string;
      published_at: string;
      html_url: string;
    }>;

    // Filter by channel
    const eligible = releases.filter((r) => {
      if (r.draft) return false;
      if (channel === "beta") return true;
      return !r.prerelease && !r.tag_name.includes("-beta");
    });

    if (eligible.length > 0) {
      const newest = eligible[0];
      const newVer = newest.tag_name.replace(/^v/, "").trim();

      // Simple version comparison
      if (newVer !== currentVersion) {
        latestUpdateResult = {
          updateAvailable: true,
          version: newVer,
          channel: newest.prerelease ? "beta" : "stable",
          releaseDate: newest.published_at,
          notes: newest.body,
          assetUrl: newest.html_url,
        };

        broadcastToWindows("updater:status", {
          status: "available",
          version: newVer,
          notes: newest.body,
        });

        return latestUpdateResult;
      }
    }
  } catch (err) {
    console.warn("[updater] direct GitHub check failed:", err);
  }

  broadcastToWindows("updater:status", { status: "not-available" });
  return { updateAvailable: false, reason: "Application is up to date" };
}

/**
 * Start downloading an update (User-Approved action).
 */
export async function startUpdateDownload(): Promise<{ success: boolean; message?: string }> {
  // If running in AppImage or Windows NSIS with electron-updater
  if (app.isPackaged && (process.platform === "win32" || process.env.APPIMAGE)) {
    try {
      broadcastToWindows("updater:status", { status: "downloading", progress: 0 });
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      console.warn("[updater] autoUpdater.downloadUpdate failed:", err);
      // Fallback: open release page
      if (latestUpdateResult?.assetUrl) {
        shell.openExternal(latestUpdateResult.assetUrl);
        return { success: true, message: "Opened download link in browser" };
      }
    }
  }

  // Standalone/manual download (deb, rpm, portable zip)
  if (latestUpdateResult?.assetUrl) {
    shell.openExternal(latestUpdateResult.assetUrl);
    return { success: true, message: "Opened download page in browser" };
  }

  shell.openExternal("https://github.com/johan-droid/Zenkai-Desktop-/releases/latest");
  return { success: true, message: "Opened release page" };
}

/**
 * Apply the downloaded update and restart the application (User-Approved action).
 */
export async function applyUpdateAndRestart(): Promise<void> {
  if (app.isPackaged && (process.platform === "win32" || process.env.APPIMAGE)) {
    autoUpdater.quitAndInstall();
    return;
  }

  // For non-AppImage packages
  shell.openExternal("https://github.com/johan-droid/Zenkai-Desktop-/releases/latest");
}

/**
 * Manual check for updates (callable from menu / tray).
 */
export async function checkForUpdatesManual(): Promise<void> {
  const result = await checkForUpdatesClient();
  if (result.updateAvailable && result.version) {
    showNotification({
      id: `manual-update-${result.version}`,
      title: "⚡ Zenkai Desktop Update Available",
      body: `Version v${result.version} is now available. Click to review in settings.`,
    });
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update Available",
      message: `A new version of Zenkai Desktop (v${result.version}) is available!`,
      detail: `Channel: ${result.channel || "stable"}\n\nWould you like to download this update?`,
      buttons: ["Download Update", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      await startUpdateDownload();
    }
  } else {
    await dialog.showMessageBox({
      type: "info",
      title: "Up to Date",
      message: `Zenkai Desktop is up to date!`,
      detail: `You are currently running the latest version (v${app.getVersion()}).`,
      buttons: ["OK"],
    });
  }
}
