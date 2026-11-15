import { app, BrowserWindow, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { showNotification } from "./notify";
import { isPlaybackActive } from "./playback";
import { readSettings } from "./settings";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface UpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
  channel?: string;
  releaseDate?: string;
  notes?: string;
  mandatory?: boolean;
  assetUrl?: string;
  assetName?: string;
  isLinuxNativePackage?: boolean;
  reason?: string;
}

let latestUpdateResult: UpdateCheckResult | null = null;
let downloadedPackagePath: string | null = null;

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

/**
 * Downloads a file with progress updates.
 */
async function downloadFileWithProgress(
  url: string,
  targetPath: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const partPath = `${targetPath}.part`;
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": `Zenkai-Desktop/${app.getVersion()}` },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }

  const contentLength = res.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  let received = 0;
  let lastReported = 0;

  fs.mkdirSync(join(targetPath, ".."), { recursive: true });
  const fileStream = fs.createWriteStream(partPath);

  const nodeReadable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);

  nodeReadable.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (total > 0) {
      const pct = Math.min(100, Math.round((received / total) * 100));
      if (pct !== lastReported) {
        lastReported = pct;
        onProgress(pct);
      }
    }
  });

  nodeReadable.pipe(fileStream);
  await finished(fileStream);

  fs.renameSync(partPath, targetPath);
}

function detectLinuxPackagePreference(): "deb" | "rpm" {
  try {
    if (fs.existsSync("/etc/debian_version")) return "deb";
    if (
      fs.existsSync("/etc/redhat-release") ||
      fs.existsSync("/etc/fedora-release") ||
      fs.existsSync("/etc/SuSE-release")
    ) {
      return "rpm";
    }
  } catch {
    // fallback
  }
  return "deb";
}

function getArchSuffixes(): { deb: string[]; rpm: string[] } {
  const arch = process.arch;
  if (arch === "arm64") {
    return { deb: ["arm64", "aarch64"], rpm: ["aarch64", "arm64"] };
  }
  if (arch === "ia32") {
    return { deb: ["i386", "ia32"], rpm: ["i686", "i386"] };
  }
  return { deb: ["amd64", "x86_64"], rpm: ["x86_64", "amd64"] };
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

    if (isPlaybackActive()) {
      console.log(`[updater] update notification deferred: media playback is active`);
    } else {
      try {
        showNotification({
          id: `update-available-${info.version}`,
          title: "⚡ Zenkai Desktop Update Available",
          body: `Version v${info.version} is now available. Click to review and download.`,
        });
      } catch {
        // ignore notification error
      }
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

    if (isPlaybackActive()) {
      console.log(`[updater] update-downloaded notification deferred: media playback is active`);
    } else {
      try {
        showNotification({
          id: `update-downloaded-${info.version}`,
          title: "⚡ Update Ready to Install",
          body: `Version v${info.version} is ready. Restart to apply update.`,
        });
      } catch {
        // ignore
      }
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
    if (isPlaybackActive()) {
      console.log("[updater] interval update check skipped: media playback is active");
      return;
    }
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[updater] interval check failed:", err.message);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Check for updates purely via GitHub Releases (zero-configuration, user-friendly).
 */
export async function checkForUpdatesClient(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const settings = readSettings(getSettingsPath());
  const channel = settings.channel;

  broadcastToWindows("updater:status", { status: "checking" });

  try {
    const res = await fetch(
      "https://api.github.com/repos/johan-droid/Zenkai-Desktop-/releases",
      {
        headers: { "User-Agent": `Zenkai-Desktop/${currentVersion}` },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) {
      return { updateAvailable: false, reason: `GitHub check returned status ${res.status}` };
    }

    const releases = (await res.json()) as Array<{
      tag_name: string;
      prerelease: boolean;
      draft: boolean;
      body: string;
      published_at: string;
      html_url: string;
      assets?: Array<{
        name: string;
        browser_download_url: string;
        size: number;
      }>;
    }>;

    // Filter by user-selected channel: "stable" vs "beta"
    const eligible = releases.filter((r) => {
      if (r.draft) return false;
      if (channel === "beta") return true;
      return !r.prerelease && !r.tag_name.includes("-beta") && !r.tag_name.includes("-alpha");
    });

    if (eligible.length > 0) {
      const newest = eligible[0];
      const newVer = newest.tag_name.replace(/^v/, "").trim();

      if (newVer !== currentVersion) {
        let matchingAssetUrl = newest.html_url;
        let matchingAssetName: string | undefined;
        let isLinuxNative = false;

        // On Linux native package (non-AppImage), locate .deb / .rpm asset for 1-click download
        if (process.platform === "linux" && !process.env.APPIMAGE && newest.assets) {
          const pref = detectLinuxPackagePreference();
          const suffixes = getArchSuffixes();
          const preferredExt = `.${pref}`;
          const targetSuffixes = suffixes[pref];

          let asset = newest.assets.find((a) => {
            const lower = a.name.toLowerCase();
            return lower.endsWith(preferredExt) && targetSuffixes.some((s) => lower.includes(s));
          });

          if (!asset) {
            asset = newest.assets.find((a) => a.name.toLowerCase().endsWith(preferredExt));
          }
          if (!asset) {
            asset = newest.assets.find(
              (a) => a.name.toLowerCase().endsWith(".deb") || a.name.toLowerCase().endsWith(".rpm"),
            );
          }

          if (asset) {
            matchingAssetUrl = asset.browser_download_url;
            matchingAssetName = asset.name;
            isLinuxNative = true;
          }
        }

        latestUpdateResult = {
          updateAvailable: true,
          version: newVer,
          channel: newest.prerelease ? "beta" : "stable",
          releaseDate: newest.published_at,
          notes: newest.body,
          assetUrl: matchingAssetUrl,
          assetName: matchingAssetName,
          isLinuxNativePackage: isLinuxNative,
        };

        broadcastToWindows("updater:status", {
          status: "available",
          version: newVer,
          notes: newest.body,
        });

        if (!isPlaybackActive()) {
          try {
            showNotification({
              id: `update-available-${newVer}`,
              title: "⚡ Zenkai Desktop Update Available",
              body: `Version v${newVer} is now available. Click to review in settings.`,
            });
          } catch {
            // ignore
          }
        }

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
  if (isPlaybackActive()) {
    return {
      success: false,
      message: "Update download deferred: active media playback is in progress.",
    };
  }

  // 1. AppImage or Windows NSIS with electron-updater
  if (app.isPackaged && (process.platform === "win32" || process.env.APPIMAGE)) {
    try {
      broadcastToWindows("updater:status", { status: "downloading", progress: 0 });
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      console.warn("[updater] autoUpdater.downloadUpdate failed:", err);
      if (latestUpdateResult?.assetUrl) {
        shell.openExternal(latestUpdateResult.assetUrl);
        return { success: true, message: "Opened download link in browser" };
      }
    }
  }

  // 2. Linux native package (.deb / .rpm) -> Download directly to Downloads folder (Option B)
  if (
    latestUpdateResult?.isLinuxNativePackage &&
    latestUpdateResult.assetUrl &&
    latestUpdateResult.assetName
  ) {
    try {
      broadcastToWindows("updater:status", { status: "downloading", progress: 0 });
      const targetDir = app.getPath("downloads");
      const targetFile = join(targetDir, latestUpdateResult.assetName);

      await downloadFileWithProgress(latestUpdateResult.assetUrl, targetFile, (progress) => {
        broadcastToWindows("updater:status", { status: "downloading", progress });
      });

      downloadedPackagePath = targetFile;
      broadcastToWindows("updater:status", {
        status: "downloaded",
        version: latestUpdateResult.version,
      });

      if (!isPlaybackActive()) {
        try {
          showNotification({
            id: `update-downloaded-${latestUpdateResult.version}`,
            title: "⚡ Zenkai Desktop Downloaded",
            body: `Package ${latestUpdateResult.assetName} saved to Downloads. Click to view or install.`,
          });
        } catch {
          // ignore
        }
      }

      return { success: true, message: `Package saved to ${targetFile}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[updater] direct download to Downloads folder failed:", msg);
      broadcastToWindows("updater:status", { status: "error", error: msg });
      if (latestUpdateResult.assetUrl) {
        shell.openExternal(latestUpdateResult.assetUrl);
      }
      return { success: false, message: msg };
    }
  }

  // 3. Standalone/manual download fallback
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
  if (isPlaybackActive()) {
    console.warn("[updater] restart deferred because media playback is active");
    throw new Error("Cannot restart while media playback is in progress.");
  }

  if (app.isPackaged && (process.platform === "win32" || process.env.APPIMAGE)) {
    autoUpdater.quitAndInstall();
    return;
  }

  // If a Linux package was downloaded to Downloads folder
  if (downloadedPackagePath && fs.existsSync(downloadedPackagePath)) {
    shell.showItemInFolder(downloadedPackagePath);
    return;
  }

  // For non-AppImage packages fallback
  shell.openExternal("https://github.com/johan-droid/Zenkai-Desktop-/releases/latest");
}

/**
 * Manual check for updates (callable from menu / tray).
 */
export async function checkForUpdatesManual(): Promise<void> {
  const result = await checkForUpdatesClient();
  if (result.updateAvailable && result.version) {
    if (!isPlaybackActive()) {
      showNotification({
        id: `manual-update-${result.version}`,
        title: "⚡ Zenkai Desktop Update Available",
        body: `Version v${result.version} is now available. Click to review in settings.`,
      });
    }
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
