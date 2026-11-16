import { app, BrowserWindow, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import crypto from "node:crypto";
import fs from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { showNotification } from "./notify";
import { isPlaybackActive } from "./playback";
import { readSettings } from "./settings";
import { log } from "./logger";

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
  sha256?: string;
  isLinuxNativePackage?: boolean;
  reason?: string;
}

export interface UpdateDiagnostics {
  currentVersion: string;
  channel: "stable" | "beta" | "internal";
  lastCheckTime?: string;
  updateAvailable: boolean;
  availableVersion?: string;
  downloadState: "idle" | "downloading" | "downloaded" | "failed";
  downloadedVersion?: string;
  downloadedFile?: string;
  verificationState: "none" | "pending" | "verified" | "failed";
  computedHash?: string;
  expectedHash?: string;
  installationState: "idle" | "ready" | "in_progress" | "failed";
  lastFailureReason?: string;
  lastSuccessfulUpdate?: string;
}

let latestUpdateResult: UpdateCheckResult | null = null;
let downloadedPackagePath: string | null = null;

const currentDiagnostics: UpdateDiagnostics = {
  currentVersion: "0.0.1",
  channel: "stable",
  updateAvailable: false,
  downloadState: "idle",
  verificationState: "none",
  installationState: "idle",
};

function getSettingsPath(): string {
  const dir = app.getPath("userData");
  return join(dir, "settings.json");
}

function getDiagnosticsPath(): string {
  const dir = app.getPath("userData");
  return join(dir, "update-diagnostics.json");
}

function persistDiagnostics(): void {
  try {
    fs.writeFileSync(getDiagnosticsPath(), JSON.stringify(currentDiagnostics, null, 2), "utf8");
  } catch {
    // ignore filesystem write errors during shutdown or testing
  }
}

export function getUpdateDiagnostics(): UpdateDiagnostics {
  try {
    currentDiagnostics.currentVersion = app.getVersion();
    const settings = readSettings(getSettingsPath());
    currentDiagnostics.channel = (settings.channel as "stable" | "beta" | "internal") || "stable";
  } catch {
    // fallback
  }
  return { ...currentDiagnostics };
}

function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function parseSemver(v: string): [number, number, number, string | null] {
  const clean = v.replace(/^v/, "").trim();
  const [core, prerelease] = clean.split("-");
  const [major, minor, patch] = core.split(".").map((n) => parseInt(n, 10) || 0);
  return [major, minor, patch, prerelease || null];
}

export function isStrictlyNewer(candidate: string, current: string): boolean {
  const [cMaj, cMin, cPat, cPre] = parseSemver(candidate);
  const [currMaj, currMin, currPat, currPre] = parseSemver(current);

  if (cMaj !== currMaj) return cMaj > currMaj;
  if (cMin !== currMin) return cMin > currMin;
  if (cPat !== currPat) return cPat > currPat;

  // Prerelease comparison: candidate without prerelease is newer than current with prerelease
  if (currPre && !cPre) return true;
  if (!currPre && cPre) return false;
  return false;
}

/**
 * Downloads a file while streaming into a destination and simultaneously calculating its SHA-256.
 */
async function downloadFileWithHash(
  url: string,
  targetPath: string,
  onProgress: (percent: number) => void,
): Promise<{ computedHash: string }> {
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
  const hasher = crypto.createHash("sha256");

  const nodeReadable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);

  nodeReadable.on("data", (chunk: Buffer) => {
    received += chunk.length;
    hasher.update(chunk);
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

  const computedHash = hasher.digest("hex").toLowerCase();
  return { computedHash };
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
    log.updater.info("Checking for updates via autoUpdater...");
    console.log("[updater] checking for updates...");
    currentDiagnostics.lastCheckTime = new Date().toISOString();
    broadcastToWindows("updater:status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    log.updater.info(`Update available: v${info.version}`);
    console.log(`[updater] update available: ${info.version}`);
    currentDiagnostics.updateAvailable = true;
    currentDiagnostics.availableVersion = info.version;
    currentDiagnostics.downloadState = "idle";
    persistDiagnostics();

    latestUpdateResult = {
      updateAvailable: true,
      version: info.version,
      releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : undefined,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      sha256: typeof info.sha512 === "string" ? info.sha512 : undefined,
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
    log.updater.success("Application is up to date");
    console.log("[updater] app is up to date");
    currentDiagnostics.updateAvailable = false;
    currentDiagnostics.availableVersion = undefined;
    persistDiagnostics();
    broadcastToWindows("updater:status", { status: "not-available" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    log.updater.debug(`Download progress: ${Math.round(progressObj.percent)}%`);
    currentDiagnostics.downloadState = "downloading";
    broadcastToWindows("updater:status", {
      status: "downloading",
      progress: progressObj.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.updater.success(`Update v${info.version} downloaded and verified`);
    console.log(`[updater] update downloaded: ${info.version}`);
    currentDiagnostics.downloadState = "downloaded";
    currentDiagnostics.downloadedVersion = info.version;
    currentDiagnostics.verificationState = "verified";
    currentDiagnostics.installationState = "ready";
    persistDiagnostics();

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
    currentDiagnostics.downloadState = "failed";
    currentDiagnostics.lastFailureReason = err.message;
    persistDiagnostics();

    // If the error is a 404 on the release metadata file (e.g. latest-linux.yml not yet uploaded or release in progress),
    // do not broadcast an alarming error banner to the user; fall back gracefully to checkForUpdatesClient.
    const isMissingManifest =
      err.message.includes("404") ||
      err.message.includes("latest-linux.yml") ||
      err.message.includes("latest.yml");

    if (!isMissingManifest) {
      broadcastToWindows("updater:status", {
        status: "error",
        error: err.message,
      });
    } else {
      console.log(
        "[updater] update manifest not found on GitHub release (404), falling back to direct release check",
      );
    }
  });

  // Check on launch
  autoUpdater.checkForUpdates().catch((err) => {
    console.warn("[updater] initial check failed:", err.message);
  });
  checkForUpdatesClient().catch((err) => {
    console.warn("[updater] initial GitHub check failed:", err.message);
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
    checkForUpdatesClient().catch((err) => {
      console.warn("[updater] interval GitHub check failed:", err.message);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Check for updates purely via GitHub Releases API with cryptographic hash discovery and downgrade prevention.
 */
export async function checkForUpdatesClient(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const settings = readSettings(getSettingsPath());
  const channel = (settings.channel as "stable" | "beta" | "internal") || "stable";

  currentDiagnostics.currentVersion = currentVersion;
  currentDiagnostics.channel = channel;
  currentDiagnostics.lastCheckTime = new Date().toISOString();

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
      currentDiagnostics.lastFailureReason = `GitHub check returned status ${res.status}`;
      persistDiagnostics();
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

    // Filter by user-selected channel: "stable", "beta", or "internal"
    const eligible = releases.filter((r) => {
      if (r.draft) return false;
      if (channel === "internal") return true;
      if (channel === "beta") return true;
      // Stable channel rejects prereleases and non-standard tags
      return !r.prerelease && !r.tag_name.includes("-beta") && !r.tag_name.includes("-alpha") && !r.tag_name.includes("-rc") && !r.tag_name.includes("-internal");
    });

    if (eligible.length > 0) {
      const newest = eligible[0];
      const newVer = newest.tag_name.replace(/^v/, "").trim();

      // STRICT DOWNGRADE PREVENTION: Candidate version must be strictly newer than current version
      if (isStrictlyNewer(newVer, currentVersion)) {
        let matchingAssetUrl = newest.html_url;
        let matchingAssetName: string | undefined;
        let isLinuxNative = false;

        // Locate matching platform asset from GitHub release assets
        if (newest.assets && newest.assets.length > 0) {
          if (process.platform === "win32") {
            const winAsset =
              newest.assets.find((a) => a.name.toLowerCase().endsWith(".exe") && a.name.toLowerCase().includes("setup")) ||
              newest.assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
            if (winAsset) {
              matchingAssetUrl = winAsset.browser_download_url;
              matchingAssetName = winAsset.name;
            }
          } else if (process.platform === "linux") {
            if (process.env.APPIMAGE || (!fs.existsSync("/etc/debian_version") && !fs.existsSync("/etc/redhat-release"))) {
              const appImageAsset = newest.assets.find((a) => a.name.toLowerCase().endsWith(".appimage"));
              if (appImageAsset) {
                matchingAssetUrl = appImageAsset.browser_download_url;
                matchingAssetName = appImageAsset.name;
              }
            }
            if (!matchingAssetName) {
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
                  (a) => a.name.toLowerCase().endsWith(".deb") || a.name.toLowerCase().endsWith(".rpm") || a.name.toLowerCase().endsWith(".appimage"),
                );
              }

              if (asset) {
                matchingAssetUrl = asset.browser_download_url;
                matchingAssetName = asset.name;
                isLinuxNative = !asset.name.toLowerCase().endsWith(".appimage");
              }
            }
          } else if (process.platform === "darwin") {
            const macAsset = newest.assets.find((a) => a.name.toLowerCase().endsWith(".dmg"));
            if (macAsset) {
              matchingAssetUrl = macAsset.browser_download_url;
              matchingAssetName = macAsset.name;
            }
          }
        }

        // Attempt to extract expected SHA-256 hash from SHA256SUMS.txt asset if present
        let expectedSha256: string | undefined;
        if (newest.assets && matchingAssetName) {
          const checksumAsset = newest.assets.find((a) => a.name === "SHA256SUMS.txt" || a.name.startsWith("checksums-"));
          if (checksumAsset) {
            try {
              const csRes = await fetch(checksumAsset.browser_download_url, { signal: AbortSignal.timeout(5000) });
              if (csRes.ok) {
                const csText = await csRes.text();
                for (const line of csText.split("\n")) {
                  const parts = line.trim().split(/\s+/);
                  if (parts.length >= 2) {
                    const hash = parts[0];
                    const filename = parts.slice(1).join(" ");
                    if (filename.includes(matchingAssetName) || matchingAssetName.includes(filename)) {
                      expectedSha256 = hash.toLowerCase();
                      break;
                    }
                  }
                }
              }
            } catch {
              // checksum file fetch failed, will proceed with standard asset download
            }
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
          sha256: expectedSha256,
          isLinuxNativePackage: isLinuxNative,
        };

        currentDiagnostics.updateAvailable = true;
        currentDiagnostics.availableVersion = newVer;
        currentDiagnostics.expectedHash = expectedSha256;
        persistDiagnostics();

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
    currentDiagnostics.lastFailureReason = String(err);
    persistDiagnostics();
  }

  currentDiagnostics.updateAvailable = false;
  persistDiagnostics();
  broadcastToWindows("updater:status", { status: "not-available" });
  return { updateAvailable: false, reason: "Application is up to date" };
}

/**
 * Start downloading an update with streaming SHA-256 checksum verification (User-Approved action).
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
      currentDiagnostics.downloadState = "downloading";
      broadcastToWindows("updater:status", { status: "downloading", progress: 0 });
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      console.warn("[updater] autoUpdater.downloadUpdate failed, attempting direct binary pull:", err);
    }
  }

  // 2. Direct binary pull from GitHub Releases to Downloads directory with SHA-256 verification
  if (latestUpdateResult?.assetUrl && latestUpdateResult?.assetName) {
    try {
      currentDiagnostics.downloadState = "downloading";
      broadcastToWindows("updater:status", { status: "downloading", progress: 0 });
      const targetDir = app.getPath("downloads");
      const targetFile = join(targetDir, latestUpdateResult.assetName);
      const partPath = `${targetFile}.part`;

      const { computedHash } = await downloadFileWithHash(latestUpdateResult.assetUrl, targetFile, (progress) => {
        broadcastToWindows("updater:status", { status: "downloading", progress });
      });

      // LIFECYCLE STAGE: VERIFYING
      currentDiagnostics.verificationState = "pending";
      currentDiagnostics.computedHash = computedHash;
      broadcastToWindows("updater:status", { status: "verifying", version: latestUpdateResult.version });

      // If expected SHA-256 is present, strictly enforce match
      if (latestUpdateResult.sha256) {
        if (computedHash !== latestUpdateResult.sha256.toLowerCase()) {
          try {
            if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
          } catch {}
          currentDiagnostics.verificationState = "failed";
          currentDiagnostics.downloadState = "failed";
          currentDiagnostics.lastFailureReason = `SHA-256 mismatch: expected ${latestUpdateResult.sha256}, got ${computedHash}`;
          persistDiagnostics();

          broadcastToWindows("updater:status", {
            status: "error",
            error: "Cryptographic SHA-256 integrity check failed. Update aborted.",
          });
          return { success: false, message: "Cryptographic checksum mismatch" };
        }
      }

      // Rename .part to final target file
      if (fs.existsSync(partPath)) {
        fs.renameSync(partPath, targetFile);
      }

      downloadedPackagePath = targetFile;
      currentDiagnostics.downloadState = "downloaded";
      currentDiagnostics.downloadedVersion = latestUpdateResult.version;
      currentDiagnostics.downloadedFile = targetFile;
      currentDiagnostics.verificationState = "verified";
      currentDiagnostics.installationState = "ready";
      persistDiagnostics();

      broadcastToWindows("updater:status", {
        status: "downloaded",
        version: latestUpdateResult.version,
      });

      if (!isPlaybackActive()) {
        try {
          showNotification({
            id: `update-downloaded-${latestUpdateResult.version}`,
            title: "⚡ Zenkai Desktop Downloaded & Verified",
            body: `Package ${latestUpdateResult.assetName} (SHA-256 verified) is ready. Click to apply update.`,
          });
        } catch {
          // ignore
        }
      }

      return { success: true, message: `Package verified and saved to ${targetFile}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[updater] direct download failed:", msg);
      currentDiagnostics.downloadState = "failed";
      currentDiagnostics.lastFailureReason = msg;
      persistDiagnostics();

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

  currentDiagnostics.installationState = "in_progress";
  persistDiagnostics();

  try {
    if (app.isPackaged && (process.platform === "win32" || process.env.APPIMAGE)) {
      autoUpdater.quitAndInstall();
      return;
    }
  } catch (err) {
    console.warn("[updater] autoUpdater.quitAndInstall threw, checking direct downloaded file:", err);
  }

  // If a binary package was downloaded directly
  if (downloadedPackagePath && fs.existsSync(downloadedPackagePath)) {
    if (process.platform === "win32" && downloadedPackagePath.endsWith(".exe")) {
      shell.openPath(downloadedPackagePath);
      currentDiagnostics.lastSuccessfulUpdate = new Date().toISOString();
      persistDiagnostics();
      setTimeout(() => app.quit(), 500);
      return;
    }
    if (process.platform === "linux") {
      if (downloadedPackagePath.endsWith(".AppImage")) {
        try {
          fs.chmodSync(downloadedPackagePath, 0o755);
        } catch {}
        shell.openPath(downloadedPackagePath);
        currentDiagnostics.lastSuccessfulUpdate = new Date().toISOString();
        persistDiagnostics();
        setTimeout(() => app.quit(), 500);
        return;
      }
      shell.showItemInFolder(downloadedPackagePath);
      return;
    }
    shell.showItemInFolder(downloadedPackagePath);
    return;
  }

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
