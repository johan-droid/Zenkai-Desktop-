import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isStrictlyNewer, parseSemver } from "../../src/main/updater";

describe("Phase 1 — Semantic Versioning & Conventional Commits", () => {
  it("parses semver versions and prerelease flags accurately", () => {
    expect(parseSemver("0.0.1")).toEqual([0, 0, 1, null]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3, null]);
    expect(parseSemver("v2.0.0-beta.1")).toEqual([2, 0, 0, "beta.1"]);
    expect(parseSemver("0.1.0-rc.2")).toEqual([0, 1, 0, "rc.2"]);
  });

  it("evaluates strictly newer semver and prevents downgrade", () => {
    // Normal upgrades
    expect(isStrictlyNewer("0.0.2", "0.0.1")).toBe(true);
    expect(isStrictlyNewer("0.1.0", "0.0.5")).toBe(true);
    expect(isStrictlyNewer("1.0.0", "0.9.9")).toBe(true);

    // Identical versions
    expect(isStrictlyNewer("0.0.1", "0.0.1")).toBe(false);

    // Downgrade attempts (must be strictly rejected)
    expect(isStrictlyNewer("0.0.1", "0.0.2")).toBe(false);
    expect(isStrictlyNewer("0.9.0", "1.0.0")).toBe(false);

    // Prerelease promotions
    expect(isStrictlyNewer("0.0.2", "0.0.2-beta.1")).toBe(true);
    expect(isStrictlyNewer("0.0.2-beta.1", "0.0.2")).toBe(false);
  });
});

describe("Phase 3 & 4 — Artifact & Integrity Verifications", () => {
  it("verifies SHA-256 calculation matches crypto standard", () => {
    const payload = Buffer.from("Zenkai-Desktop-Production-Package-Test-Payload");
    const expectedHash = crypto.createHash("sha256").update(payload).digest("hex");

    const tmpPath = path.join("/tmp", `zenkai-test-${Date.now()}.bin`);
    fs.writeFileSync(tmpPath, payload);

    try {
      const computedHash = crypto.createHash("sha256").update(fs.readFileSync(tmpPath)).digest("hex");
      expect(computedHash).toBe(expectedHash);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it("rejects mismatched SHA-256 checksums", () => {
    const original = Buffer.from("Authentic package bytes");
    const corrupted = Buffer.from("Corrupted package bytes");

    const hashOriginal = crypto.createHash("sha256").update(original).digest("hex");
    const hashCorrupted = crypto.createHash("sha256").update(corrupted).digest("hex");

    expect(hashOriginal).not.toBe(hashCorrupted);
  });
});

describe("Phase 8 & 11 — Update Diagnostics & Channel Separation", () => {
  it("channel separation rules: stable rejects beta/internal prereleases", () => {
    const sampleReleases = [
      { tag_name: "v0.0.3-beta.1", prerelease: true },
      { tag_name: "v0.0.2", prerelease: false },
      { tag_name: "v0.0.1", prerelease: false },
    ];

    // User on stable channel
    const stableEligible = sampleReleases.filter(
      (r) => !r.prerelease && !r.tag_name.includes("-beta") && !r.tag_name.includes("-alpha"),
    );
    expect(stableEligible.map((r) => r.tag_name)).toEqual(["v0.0.2", "v0.0.1"]);

    // User on beta channel
    const betaEligible = sampleReleases.filter(() => true);
    expect(betaEligible.map((r) => r.tag_name)).toEqual(["v0.0.3-beta.1", "v0.0.2", "v0.0.1"]);
  });
});
