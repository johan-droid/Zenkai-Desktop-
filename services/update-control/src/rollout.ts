import crypto from "node:crypto";
import type { ReleaseChannel, ReleaseRecord, UpdateCheckParams, UpdateCheckResult } from "./types.js";

/**
 * Compare two semver-like strings (e.g., "0.0.1", "0.0.2-beta.1", "1.0.0").
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/, "").trim();
  const cleanB = b.replace(/^v/, "").trim();

  const [mainA, preA] = cleanA.split("-");
  const [mainB, preB] = cleanB.split("-");

  const partsA = mainA.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = mainB.split(".").map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < 3; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  // If main versions are equal, non-prerelease is newer than prerelease
  if (!preA && preB) return 1; // 1.0.0 is newer than 1.0.0-beta
  if (preA && !preB) return -1;
  if (preA && preB) {
    return preA.localeCompare(preB, undefined, { numeric: true });
  }

  return 0;
}

/**
 * Deterministically compute a cohort bucket (0-99) for an installation and release tag.
 * Preserves privacy: uses one-way hash of installationId + tag without tracking personal identity.
 */
export function calculateCohort(installationId: string, releaseTag: string): number {
  const hash = crypto
    .createHash("sha256")
    .update(`${installationId}:${releaseTag}`)
    .digest();
  const value = hash.readUInt32BE(0);
  return value % 100;
}

/**
 * Determine the most suitable asset for a given client platform and architecture.
 */
export function selectBestAsset(
  record: ReleaseRecord,
  platform: string,
  arch: string,
): ReleaseRecord["assets"][0] | undefined {
  const normArch = arch === "x86_64" ? "x64" : arch;

  // 1. AppImage for Linux x64
  if (platform === "linux") {
    const appImage = record.assets.find(
      (a) => a.name.endsWith(".AppImage") && (a.name.includes(normArch) || a.name.includes("x64")),
    );
    if (appImage) return appImage;

    const deb = record.assets.find(
      (a) => a.name.endsWith(".deb") && (a.name.includes(normArch) || a.name.includes("x64")),
    );
    if (deb) return deb;
  }

  // 2. NSIS setup exe for Windows x64
  if (platform === "win32") {
    const exe = record.assets.find(
      (a) => a.name.endsWith("-Setup.exe") || (a.name.endsWith(".exe") && a.name.includes("Setup")),
    );
    if (exe) return exe;

    const zip = record.assets.find((a) => a.name.endsWith(".zip") && a.name.includes("Portable"));
    if (zip) return zip;
  }

  // 3. DMG / Zip for macOS
  if (platform === "darwin") {
    const dmg = record.assets.find((a) => a.name.endsWith(".dmg"));
    if (dmg) return dmg;

    const zip = record.assets.find((a) => a.name.endsWith(".zip"));
    if (zip) return zip;
  }

  // Fallback to any platform-matching asset
  return record.assets.find((a) => a.platform === platform);
}

/**
 * Evaluate update eligibility for a client given the list of known release records.
 */
export function evaluateUpdateEligibility(
  releases: ReleaseRecord[],
  params: UpdateCheckParams,
): UpdateCheckResult {
  // Filter active, non-withdrawn releases matching client channel, sorted newest first
  const candidates = releases
    .filter((r) => !r.withdrawn)
    .filter((r) => {
      if (params.channel === "beta") return true; // Beta clients receive both beta and stable
      return r.channel === "stable"; // Stable clients only receive stable
    })
    .sort((a, b) => compareVersions(b.version, a.version));

  for (const candidate of candidates) {
    // Candidate must be newer than client version
    if (compareVersions(candidate.version, params.version) <= 0) {
      break;
    }

    // Check staged rollout cohort
    if (candidate.rolloutPercentage < 100) {
      if (!params.installationId) {
        continue; // Client without installationId held back, try next candidate
      }
      const cohort = calculateCohort(params.installationId, candidate.tag);
      if (cohort >= candidate.rolloutPercentage) {
        continue; // Cohort not yet eligible for this candidate, try next candidate
      }
    }

    // Candidate is eligible! Select best asset
    const asset = selectBestAsset(candidate, params.platform, params.arch);

    let metadataUrl: string | undefined;
    if (params.platform === "linux") metadataUrl = candidate.metadataUrls.linux;
    if (params.platform === "win32") metadataUrl = candidate.metadataUrls.win32;
    if (params.platform === "darwin") metadataUrl = candidate.metadataUrls.darwin;

    return {
      updateAvailable: true,
      version: candidate.version,
      tag: candidate.tag,
      channel: candidate.channel,
      releaseDate: candidate.publishedAt,
      mandatory: candidate.mandatory,
      notes: candidate.notes,
      asset,
      metadataUrl,
    };
  }

  return {
    updateAvailable: false,
    reason: "Client is up to date or not eligible for staged rollouts",
  };
}
