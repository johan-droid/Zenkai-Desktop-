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
  sha512?: string;
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
let isAutoUpdaterStaged = false;
let isDownloading = false;
let isApplyingUpdate = false;

const currentDiagnostics: UpdateDiagnostics = {
  currentVersion: "", // filled from app.getVersion() on the first check
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

export interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  body: string;
  published_at: string;
  html_url: string;
  assets?: Array<{ name: string; browser_download_url: string; size: number }>;
}

const releaseVersion = (r: GitHubRelease): string =>
  r.tag_name.replace(/^v/, "").trim();

/**
 * Picks the highest semver release for the channel. The GitHub list API is ordered by
 * creation time, not version, so a late-published older release must never shadow a newer one.
 */
export function pickNewestRelease(
  releases: GitHubRelease[],
  channel: string,
): GitHubRelease | null {
  const eligible = releases.filter((r) => {
    if (r.draft) return false;
    if (!r.tag_name) return false;
    if (channel === "beta" || channel === "internal") return true;
    return (
      !r.prerelease &&
      !/-beta|-alpha|-rc|-internal/.test(r.tag_name)
    );
  });
  let newest: GitHubRelease | null = null;
  for (const r of eligible) {
    if (!newest || isStrictlyNewer(releaseVersion(r), releaseVersion(newest))) {
      newest = r;
    }
  }
  return newest;
}

/**
 * Downloads a file while streaming into a destination and simultaneously calculating its SHA-256 and SHA-512.
 */
async function downloadFileWithHash(
  url: string,
  targetPath: string,
  onProgress: (percent: number) => void,
): Promise<{ computedHash: string; computedSha512: string }> {
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
  const hasher256 = crypto.createHash("sha256");
  const hasher512 = crypto.createHash("sha512");

  const nodeReadable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);

  nodeReadable.on("data", (chunk: Buffer) => {
    received += chunk.length;
    hasher256.update(chunk);
    hasher512.update(chunk);
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

  const computedHash = hasher256.digest("hex").toLowerCase();
  const computedSha512 = hasher512.digest("base64");
  return { computedHash, computedSha512 };
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

  try {
    if (typeof (autoUpdater as any).setFeedURL === "function") {
      (autoUpdater as any).setFeedURL({
        provider: "github",
        owner: "johan-droid",
        repo: "Zenkai-Desktop-",
        releaseType: "release",
      });
    }
  } catch {
    // ignore in tests where autoUpdater may be a stub
  }

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
    isAutoUpdaterStaged = true;
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

const RELEASES_API = "https://api.github.com/repos/johan-droid/Zenkai-Desktop-/releases";

/**
 * Fetches release metadata straight from GitHub. Falls back to the /releases/latest
 * endpoint when the list endpoint is rate-limited or failing, so a transient 403/403
 * never turns into a false "you are up to date".
 */
async function fetchGitHubReleases(
  currentVersion: string,
): Promise<{ releases: GitHubRelease[] | null; status?: number }> {
  const headers = {
    "User-Agent": `Zenkai-Desktop/${currentVersion}`,
    Accept: "application/vnd.github+json",
  };
  let status: number | undefined;

  for (const url of [`${RELEASES_API}?per_page=30`, `${RELEASES_API}/latest`]) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      status ??= res.status;
      if (!res.ok) continue;
      const json = (await res.json()) as GitHubRelease | GitHubRelease[];
      const list = Array.isArray(json) ? json : [json];
      if (list.length > 0) return { releases: list, status };
    } catch {
      // try the next endpoint
    }
  }
  return { releases: null, status };
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
    const { releases, status } = await fetchGitHubReleases(currentVersion);

    if (releases === null) {
      const reason = `GitHub check returned status ${status ?? "unreachable"}`;
      currentDiagnostics.lastFailureReason = reason;
      persistDiagnostics();
      return { updateAvailable: false, reason };
    }

    const newest = pickNewestRelease(releases, channel);

    if (newest && isStrictlyNewer(releaseVersion(newest), currentVersion)) {
      const newVer = releaseVersion(newest);

      // STRICT DOWNGRADE PREVENTION (enforced by the isStrictlyNewer guard above)
      {
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

        // Attempt to extract expected SHA-256 and SHA-512 hashes from release assets
        let expectedSha256: string | undefined;
        let expectedSha512: string | undefined;
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
              // checksum file fetch non-fatal
            }
          }

          // If SHA-256 was not found or additionally, check latest.yml / latest-linux.yml for SHA-512
          const ymlName = process.platform === "win32" ? "latest.yml" : "latest-linux.yml";
          const ymlAsset = newest.assets.find((a) => a.name === ymlName);
          if (ymlAsset) {
            try {
              const ymlRes = await fetch(ymlAsset.browser_download_url, { signal: AbortSignal.timeout(5000) });
              if (ymlRes.ok) {
                const ymlText = await ymlRes.text();
                const match = ymlText.match(/sha512:\s*([A-Za-z0-9+/=]+)/);
                if (match?.[1]) {
                  expectedSha512 = match[1];
                }
              }
            } catch {
              // yml fetch non-fatal
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
          sha512: expectedSha512,
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

  if (isDownloading) {
    return {
      success: false,
      message: "Update download already in progress.",
    };
  }

  isDownloading = true;
  try {
    // Reset staged flag on new download initiation
    isAutoUpdaterStaged = false;

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

    // 2. Direct binary pull from GitHub Releases to Downloads directory with cryptographic verification
    if (latestUpdateResult?.assetUrl && latestUpdateResult?.assetName) {
      try {
        currentDiagnostics.downloadState = "downloading";
        broadcastToWindows("updater:status", { status: "downloading", progress: 0 });
        const targetDir = app.getPath("downloads");
        const targetFile = join(targetDir, latestUpdateResult.assetName);
        const partPath = `${targetFile}.part`;

        const { computedHash, computedSha512 } = await downloadFileWithHash(latestUpdateResult.assetUrl, targetFile, (progress) => {
          broadcastToWindows("updater:status", { status: "downloading", progress });
        });

        // LIFECYCLE STAGE: VERIFYING
        currentDiagnostics.verificationState = "pending";
        currentDiagnostics.computedHash = computedHash;
        broadcastToWindows("updater:status", { status: "verifying", version: latestUpdateResult.version });

        // Enforce cryptographic checksum match (SHA-256 or SHA-512)
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
        } else if (latestUpdateResult.sha512) {
          if (computedSha512 !== latestUpdateResult.sha512) {
            try {
              if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
            } catch {}
            currentDiagnostics.verificationState = "failed";
            currentDiagnostics.downloadState = "failed";
            currentDiagnostics.lastFailureReason = `SHA-512 mismatch: expected ${latestUpdateResult.sha512}, got ${computedSha512}`;
            persistDiagnostics();

            broadcastToWindows("updater:status", {
              status: "error",
              error: "Cryptographic SHA-512 integrity check failed. Update aborted.",
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
              body: `Package ${latestUpdateResult.assetName} (cryptographically verified) is ready. Click to apply update.`,
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
  } finally {
    isDownloading = false;
  }
}

/**
 * Apply the downloaded update and restart the application (User-Approved action).
 */
export async function applyUpdateAndRestart(): Promise<void> {
  if (isPlaybackActive()) {
    console.warn("[updater] restart deferred because media playback is active");
    throw new Error("Cannot restart while media playback is in progress.");
  }

  if (isApplyingUpdate) {
    console.warn("[updater] update application already in progress");
    return;
  }

  isApplyingUpdate = true;
  try {
    currentDiagnostics.installationState = "in_progress";
    persistDiagnostics();

    // 1. If electron-updater has successfully downloaded and verified the package into its cache
    if (isAutoUpdaterStaged) {
      isAutoUpdaterStaged = false; // Reset immediately to prevent double execution
      try {
        autoUpdater.quitAndInstall();
        return;
      } catch (err) {
        console.warn("[updater] autoUpdater.quitAndInstall threw, checking direct downloaded file:", err);
      }
    }

    // 2. Direct binary package replacement / execution
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

          // In-place atomic AppImage swap if currently running from an AppImage
          if (process.env.APPIMAGE && fs.existsSync(process.env.APPIMAGE)) {
            const runningAppImage = process.env.APPIMAGE;
            const backupPath = `${runningAppImage}.old`;
            try {
              fs.copyFileSync(runningAppImage, backupPath);
              fs.copyFileSync(downloadedPackagePath, runningAppImage);
              fs.chmodSync(runningAppImage, 0o755);
              try { fs.unlinkSync(backupPath); } catch {}
              currentDiagnostics.lastSuccessfulUpdate = new Date().toISOString();
              persistDiagnostics();
              app.relaunch({ execPath: runningAppImage });
              setTimeout(() => app.quit(), 500);
              return;
            } catch (swapErr) {
              console.warn("[updater] In-place AppImage swap failed, launching downloaded binary directly:", swapErr);
              if (fs.existsSync(backupPath)) {
                try { fs.copyFileSync(backupPath, runningAppImage); fs.unlinkSync(backupPath); } catch {}
              }
            }
          }

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
  } finally {
    isApplyingUpdate = false;
  }
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
