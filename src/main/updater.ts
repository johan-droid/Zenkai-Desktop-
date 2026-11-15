import { app, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";

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
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] app is up to date");
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] update downloaded: ${info.version}`);
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
