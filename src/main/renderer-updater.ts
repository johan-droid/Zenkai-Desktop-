import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const RendererManifestSchema = z.object({
  manifestVersion: z.string().default("1"),
  rendererVersion: z.string(),
  minDesktopVersion: z.string().default("0.0.1"),
  maxDesktopVersion: z.string().optional(),
  publishedAt: z.string().optional(),
  artifactUrl: z.string().url(),
  sha256: z.string().length(64),
  releaseNotes: z.string().optional(),
  rollbackAllowed: z.boolean().default(true),
});

export type RendererManifest = z.infer<typeof RendererManifestSchema>;

export interface RendererUpdateStatus {
  checking: boolean;
  available: boolean;
  version?: string;
  notes?: string;
  error?: string;
  staged: boolean;
}

const DEFAULT_MANIFEST_URLS = [
  "https://zenkai.pages.dev/renderer/manifest.json",
  "https://zenkaii.pages.dev/renderer/manifest.json",
];

function getUpdateDirs() {
  const base = join(app.getPath("userData"), "renderer-updates");
  const active = join(base, "active");
  const staged = join(base, "staged");
  const previous = join(base, "previous");
  return { base, active, staged, previous };
}

export function getActiveRendererPath(): string {
  try {
    const { active } = getUpdateDirs();
    const activeHtml = join(active, "index.html");
    if (fs.existsSync(activeHtml) && fs.statSync(activeHtml).size > 100) {
      return activeHtml;
    }
  } catch {
    // ignore filesystem errors
  }
  return join(__dirname, "../renderer/index.html");
}

export function isSemverGte(current: string, required: string): boolean {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const [c0, c1, c2] = parse(current);
  const [r0, r1, r2] = parse(required);
  if (c0 !== r0) return c0 > r0;
  if (c1 !== r1) return c1 > r1;
  return c2 >= r2;
}

export async function fetchManifest(urls = DEFAULT_MANIFEST_URLS): Promise<RendererManifest | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Zenkai-Desktop-RendererUpdater/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      const parsed = RendererManifestSchema.safeParse(data);
      if (parsed.success) return parsed.data;
    } catch {
      // try next fallback
    }
  }
  return null;
}

export async function checkForRendererUpdate(
  currentRendererVersion: string,
  desktopVersion = app.getVersion(),
  customUrls?: string[],
): Promise<{ available: boolean; manifest: RendererManifest | null; reason?: string }> {
  const manifest = await fetchManifest(customUrls);
  if (!manifest) {
    return { available: false, manifest: null, reason: "No update manifest reached" };
  }

  if (!isSemverGte(desktopVersion, manifest.minDesktopVersion)) {
    return {
      available: false,
      manifest,
      reason: `Desktop version ${desktopVersion} is below minimum required ${manifest.minDesktopVersion}`,
    };
  }

  const isNewer = !isSemverGte(currentRendererVersion, manifest.rendererVersion);
  return { available: isNewer, manifest };
}

export async function downloadAndStageRenderer(
  manifest: RendererManifest,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { staged } = getUpdateDirs();
    fs.rmSync(staged, { recursive: true, force: true });
    fs.mkdirSync(staged, { recursive: true });

    const res = await fetch(manifest.artifactUrl, {
      headers: { "User-Agent": "Zenkai-Desktop-RendererUpdater/1.0" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status} fetching artifact`);

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify SHA256 integrity
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error(`SHA256 mismatch: expected ${manifest.sha256}, got ${hash}`);
    }

    // Save manifest details into staged directory
    fs.writeFileSync(join(staged, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[renderer-updater] download failed:", message);
    return { success: false, error: message };
  }
}

export function activateStagedRenderer(): boolean {
  try {
    const { active, staged, previous } = getUpdateDirs();
    const stagedHtml = join(staged, "index.html");
    if (!fs.existsSync(stagedHtml)) {
      console.warn("[renderer-updater] staged directory missing index.html");
      return false;
    }

    // Backup current active to previous for rollback
    fs.rmSync(previous, { recursive: true, force: true });
    if (fs.existsSync(active)) {
      fs.renameSync(active, previous);
    }

    // Activate staged
    fs.renameSync(staged, active);
    console.info("[renderer-updater] staged renderer activated successfully");
    return true;
  } catch (err) {
    console.error("[renderer-updater] activation error:", err);
    return false;
  }
}

export function rollbackRenderer(reason = "manual"): boolean {
  try {
    const { active, previous } = getUpdateDirs();
    console.warn(`[renderer-updater] rolling back renderer. Reason: ${reason}`);

    fs.rmSync(active, { recursive: true, force: true });
    if (fs.existsSync(previous)) {
      fs.renameSync(previous, active);
      console.info("[renderer-updater] rolled back to previous version");
    } else {
      console.info("[renderer-updater] restored to bundled baseline renderer");
    }
    return true;
  } catch (err) {
    console.error("[renderer-updater] rollback error:", err);
    return false;
  }
}
