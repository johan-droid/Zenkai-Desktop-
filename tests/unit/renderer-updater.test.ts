import { describe, expect, it, vi } from "vitest";
import {
  isSemverGte,
  RendererManifestSchema,
  checkForRendererUpdate,
  getActiveRendererPath,
} from "../../src/main/renderer-updater";

describe("Renderer Updater (Hybrid Independent Updates)", () => {
  it("semver comparison works across major, minor, patch", () => {
    expect(isSemverGte("1.0.0", "1.0.0")).toBe(true);
    expect(isSemverGte("1.0.5", "1.0.4")).toBe(true);
    expect(isSemverGte("2.0.0", "1.9.9")).toBe(true);
    expect(isSemverGte("1.2.0", "1.1.9")).toBe(true);
    expect(isSemverGte("1.0.0", "1.0.1")).toBe(false);
    expect(isSemverGte("0.9.0", "1.0.0")).toBe(false);
  });

  it("validates manifest schema correctly", () => {
    const valid = {
      manifestVersion: "1",
      rendererVersion: "1.0.5",
      minDesktopVersion: "0.0.1",
      artifactUrl: "https://zenkaii.pages.dev/renderer/v1.0.5.zip",
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      releaseNotes: "New player controls",
    };
    const parsed = RendererManifestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const invalid = {
      rendererVersion: "1.0.5",
      // missing sha256 and artifactUrl
    };
    expect(RendererManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("returns bundled renderer path when no active updated renderer exists", () => {
    const p = getActiveRendererPath();
    expect(p).toContain("renderer/index.html");
  });

  it("detects when desktop version is below minimum required desktop version", async () => {
    const mockManifest = {
      manifestVersion: "1",
      rendererVersion: "2.0.0",
      minDesktopVersion: "1.0.0",
      artifactUrl: "https://zenkaii.pages.dev/renderer/v2.0.0.zip",
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };

    // Global fetch mock returning mock manifest
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    });

    try {
      const res = await checkForRendererUpdate("1.0.0", "0.0.1", ["https://fake.url/manifest.json"]);
      expect(res.available).toBe(false);
      expect(res.reason).toContain("below minimum required");
    } finally {
      global.fetch = origFetch;
    }
  });

  it("detects available update when compatible and newer", async () => {
    const mockManifest = {
      manifestVersion: "1",
      rendererVersion: "1.0.5",
      minDesktopVersion: "0.0.1",
      artifactUrl: "https://zenkaii.pages.dev/renderer/v1.0.5.zip",
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    });

    try {
      const res = await checkForRendererUpdate("1.0.4", "0.0.1", ["https://fake.url/manifest.json"]);
      expect(res.available).toBe(true);
      expect(res.manifest?.rendererVersion).toBe("1.0.5");
    } finally {
      global.fetch = origFetch;
    }
  });
});
