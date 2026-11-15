export type ReleaseChannel = "stable" | "beta";

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  sha256?: string;
  platform?: "linux" | "win32" | "darwin";
  arch?: "x64" | "arm64";
  format?: "AppImage" | "deb" | "rpm" | "exe" | "zip" | "dmg";
}

export interface ReleaseRecord {
  tag: string;
  version: string;
  channel: ReleaseChannel;
  publishedAt: string;
  notes: string;
  mandatory: boolean;
  minSupportedVersion?: string;
  withdrawn: boolean;
  rolloutPercentage: number; // 0 to 100
  assets: ReleaseAsset[];
  metadataUrls: {
    linux?: string;
    win32?: string;
    darwin?: string;
  };
}

export interface UpdateCheckParams {
  platform: string;
  arch: string;
  channel: ReleaseChannel;
  version: string;
  installationId?: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
  tag?: string;
  channel?: ReleaseChannel;
  releaseDate?: string;
  mandatory?: boolean;
  notes?: string;
  asset?: ReleaseAsset;
  metadataUrl?: string;
  reason?: string;
}

