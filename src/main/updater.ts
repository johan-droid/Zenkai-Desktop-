import { app, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { showNotification } from "./notify";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Determine channel (latest default; beta if version has -beta)
  const currentVersion = app.getVersion();
  if (currentVersion.includes("-beta")) {
    autoUpdater.channel = "beta";
  } else {
    autoUpdater.channel = "latest";
  }

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] update available: ${info.version}`);
    try {
      showNotification({
        id: `update-available-${info.version}`,
        title: "⚡ Zenkai Desktop Update Available",
        body: `Version v${info.version} is available. Downloading update in background...`,
      });
    } catch {
      // ignore
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] app is up to date");
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] update downloaded: ${info.version}`);
    try {
      showNotification({
        id: `update-downloaded-${info.version}`,
        title: "⚡ Update Ready to Install",
        body: `Version v${info.version} has been downloaded. Restart to apply update.`,
      });
      dialog
        .showMessageBox({
          type: "info",
          title: "Update Ready",
          message: `A new version of Zenkai Desktop (v${info.version}) has been downloaded.`,
          detail:
            "Would you like to restart the application now to install the update?",
          buttons: ["Restart Now", "Later"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall();
          }
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  });

  autoUpdater.on("error", (err) => {
    console.warn("[updater] update check error:", err.message);
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
 * Manual check for updates (callable from application menu / tray / settings).
 */
export async function checkForUpdatesManual(): Promise<void> {
  const currentVersion = app.getVersion();
  const repoUrl = "https://github.com/johan-droid/Zenkai-Desktop-/releases/latest";

  // If running in AppImage or Windows NSIS with electron-updater active
  if (app.isPackaged && (process.platform === "win32" || process.env.APPIMAGE)) {
    try {
      await autoUpdater.checkForUpdates();
      return;
    } catch (err) {
      console.warn("[updater] manual check via autoUpdater failed, falling back to GitHub API", err);
    }
  }

  // Fallback GitHub Releases API check for portable zip, deb, rpm, and dev
  try {
    const res = await fetch("https://api.github.com/repos/johan-droid/Zenkai-Desktop-/releases/latest", {
      headers: { "User-Agent": `Zenkai-Desktop/${currentVersion}` },
    });
    if (!res.ok) {
      shell.openExternal(repoUrl);
      return;
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestTag = data.tag_name ? data.tag_name.replace(/^v/, "") : "";
    if (latestTag && latestTag !== currentVersion) {
      showNotification({
        id: `update-found-${latestTag}`,
        title: "⚡ New Version Available",
        body: `Version v${latestTag} is now available on GitHub. Click to download.`,
      });
      const { response } = await dialog.showMessageBox({
        type: "info",
        title: "Update Available",
        message: `A new version of Zenkai Desktop (v${latestTag}) is available!`,
        detail: `You are currently running v${currentVersion}. Would you like to open the GitHub Releases page to download the update?`,
        buttons: ["Download Update", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        shell.openExternal(data.html_url || repoUrl);
      }
    } else {
      await dialog.showMessageBox({
        type: "info",
        title: "Up to Date",
        message: `Zenkai Desktop is up to date!`,
        detail: `You are running the latest version (v${currentVersion}).`,
        buttons: ["OK"],
      });
    }
  } catch (err) {
    shell.openExternal(repoUrl);
  }
}
