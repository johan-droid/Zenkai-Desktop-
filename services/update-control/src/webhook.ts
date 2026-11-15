import crypto from "node:crypto";
import type { ReleaseAsset, ReleaseRecord } from "./types.js";

/**
 * Constant-time verification of GitHub's X-Hub-Signature-256 header.
 */
export function verifyGitHubWebhookSignature(
  secret: string,
  payload: string | Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = signatureHeader.substring("sha256=".length);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const computedSignature = hmac.digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const computedBuffer = Buffer.from(computedSignature, "hex");

  if (expectedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
}

export interface GitHubWebhookReleasePayload {
  action: string;
  repository: {
    full_name: string;
  };
  release: {
    id: number;
    tag_name: string;
    target_commitish: string;
    name: string;
    draft: boolean;
    prerelease: boolean;
    body: string;
    published_at: string;
    assets: Array<{
      name: string;
      browser_download_url: string;
      size: number;
      state: string;
    }>;
  };
}

/**
 * Validates and converts a GitHub release webhook payload into an authoritative ReleaseRecord.
 */
export function parseAndValidateReleaseWebhook(
  payload: GitHubWebhookReleasePayload,
  expectedRepo = "johan-droid/Zenkai-Desktop-",
): ReleaseRecord | null {
  // 1. Validate action & draft state
  if (payload.action !== "published") {
    return null;
  }
  if (!payload.release || payload.release.draft) {
    return null;
  }

  // 2. Validate expected repository
  if (
    expectedRepo &&
    payload.repository?.full_name?.toLowerCase() !== expectedRepo.toLowerCase()
  ) {
    return null;
  }

  const { tag_name, prerelease, body, published_at, assets } = payload.release;
  if (!tag_name) return null;

  const version = tag_name.replace(/^v/, "").trim();
  const channel = prerelease || tag_name.includes("-beta") ? "beta" : "stable";

  const mappedAssets: ReleaseAsset[] = [];
  const metadataUrls: ReleaseRecord["metadataUrls"] = {};

  for (const raw of assets || []) {
    // Only accept uploaded and verified assets
    if (raw.state && raw.state !== "uploaded") continue;

    // Detect metadata YAMLs
    if (raw.name === "latest-linux.yml") {
      metadataUrls.linux = raw.browser_download_url;
      continue;
    }
    if (raw.name === "latest.yml") {
      metadataUrls.win32 = raw.browser_download_url;
      continue;
    }
    if (raw.name === "latest-mac.yml") {
      metadataUrls.darwin = raw.browser_download_url;
      continue;
    }

    // Map platform and format
    let platform: ReleaseAsset["platform"];
    let format: ReleaseAsset["format"];

    if (raw.name.endsWith(".AppImage")) {
      platform = "linux";
      format = "AppImage";
    } else if (raw.name.endsWith(".deb")) {
      platform = "linux";
      format = "deb";
    } else if (raw.name.endsWith(".rpm")) {
      platform = "linux";
      format = "rpm";
    } else if (raw.name.endsWith(".exe")) {
      platform = "win32";
      format = "exe";
    } else if (raw.name.endsWith(".zip") && raw.name.includes("Windows")) {
      platform = "win32";
      format = "zip";
    } else if (raw.name.endsWith(".dmg")) {
      platform = "darwin";
      format = "dmg";
    } else if (raw.name.endsWith(".zip") && raw.name.includes("macOS")) {
      platform = "darwin";
      format = "zip";
    }

    mappedAssets.push({
      name: raw.name,
      url: raw.browser_download_url,
      size: raw.size,
      platform,
      format,
    });
  }

  return {
    tag: tag_name,
    version,
    channel,
    publishedAt: published_at || new Date().toISOString(),
    notes: body || "",
    mandatory: false,
    withdrawn: false,
    rolloutPercentage: 100, // Default to 100 unless controlled
    assets: mappedAssets,
    metadataUrls,
  };
}

