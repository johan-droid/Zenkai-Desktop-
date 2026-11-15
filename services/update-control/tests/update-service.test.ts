import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUpdateServer } from "../src/server.js";
import { calculateCohort, compareVersions } from "../src/rollout.js";
import { verifyGitHubWebhookSignature } from "../src/webhook.js";
import type { ReleaseRecord } from "../src/types.js";

const SECRET = "test-webhook-secret-123";
let serverInstance: ReturnType<typeof createUpdateServer>;
let baseUrl = "";

function sign(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

const mockRelease: ReleaseRecord = {
  tag: "v0.0.2",
  version: "0.0.2",
  channel: "stable",
  publishedAt: "2026-11-15T12:00:00Z",
  notes: "Bug fixes and improvements",
  mandatory: false,
  withdrawn: false,
  rolloutPercentage: 100,
  assets: [
    {
      name: "Zenkai-Desktop-v0.0.2-Linux-x64.AppImage",
      url: "https://github.com/johan-droid/Zenkai-Desktop-/releases/download/v0.0.2/Zenkai-Desktop-v0.0.2-Linux-x64.AppImage",
      size: 136746237,
      platform: "linux",
      format: "AppImage",
    },
    {
      name: "Zenkai-Desktop-v0.0.2-Windows-x64-Setup.exe",
      url: "https://github.com/johan-droid/Zenkai-Desktop-/releases/download/v0.0.2/Zenkai-Desktop-v0.0.2-Windows-x64-Setup.exe",
      size: 120000000,
      platform: "win32",
      format: "exe",
    },
  ],
  metadataUrls: {
    linux: "https://github.com/johan-droid/Zenkai-Desktop-/releases/download/v0.0.2/latest-linux.yml",
    win32: "https://github.com/johan-droid/Zenkai-Desktop-/releases/download/v0.0.2/latest.yml",
  },
};

beforeAll(async () => {
  serverInstance = createUpdateServer({
    port: 0,
    webhookSecret: SECRET,
    expectedRepo: "johan-droid/Zenkai-Desktop-",
  });
  const port = await serverInstance.listen(0);
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await serverInstance.close();
});

describe("Update-Control Service & Security (Phase 2 & Phase 3)", () => {
  describe("Webhook Security & Verification", () => {
    it("rejects request without signature header", async () => {
      const res = await fetch(`${baseUrl}/webhooks/github/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "published" }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid signature/i);
    });

    it("rejects request with invalid signature", async () => {
      const body = JSON.stringify({ action: "published" });
      const res = await fetch(`${baseUrl}/webhooks/github/releases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": "sha256=badsignature00000000000000000000000000000000000000000000000000000",
        },
        body,
      });
      expect(res.status).toBe(401);
    });

    it("processes valid webhook and registers release", async () => {
      const payload = {
        action: "published",
        repository: { full_name: "johan-droid/Zenkai-Desktop-" },
        release: {
          id: 123456,
          tag_name: "v0.0.2",
          name: "v0.0.2 Release",
          draft: false,
          prerelease: false,
          body: "Release notes for 0.0.2",
          published_at: "2026-11-15T12:00:00Z",
          assets: [
            {
              name: "Zenkai-Desktop-v0.0.2-Linux-x64.AppImage",
              browser_download_url: "https://github.com/.../Zenkai-Desktop-v0.0.2-Linux-x64.AppImage",
              size: 136000000,
              state: "uploaded",
            },
            {
              name: "latest-linux.yml",
              browser_download_url: "https://github.com/.../latest-linux.yml",
              size: 500,
              state: "uploaded",
            },
          ],
        },
      };

      const body = JSON.stringify(payload);
      const signature = sign(SECRET, body);

      const res = await fetch(`${baseUrl}/webhooks/github/releases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
          "X-GitHub-Delivery": "delivery-uuid-1",
        },
        body,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("success");
      expect(data.version).toBe("0.0.2");

      // Verify release is registered
      const registered = serverInstance.registry.getRelease("v0.0.2");
      expect(registered).toBeDefined();
      expect(registered?.version).toBe("0.0.2");
      expect(registered?.channel).toBe("stable");
    });

    it("ignores duplicate delivery idempotently", async () => {
      const body = JSON.stringify({ action: "published" });
      const signature = sign(SECRET, body);

      // Re-send with same delivery ID
      const res = await fetch(`${baseUrl}/webhooks/github/releases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
          "X-GitHub-Delivery": "delivery-uuid-1",
        },
        body,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ignored");
      expect(data.reason).toMatch(/duplicate/i);
    });

    it("ignores drafts", async () => {
      const payload = {
        action: "published",
        repository: { full_name: "johan-droid/Zenkai-Desktop-" },
        release: { tag_name: "v0.0.3", draft: true },
      };
      const body = JSON.stringify(payload);
      const res = await fetch(`${baseUrl}/webhooks/github/releases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": sign(SECRET, body),
        },
        body,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ignored");
    });
  });

  describe("Client Update Queries & Channels", () => {
    it("reports update available when newer version exists", async () => {
      const res = await fetch(
        `${baseUrl}/desktop/v1/updates/latest?platform=linux&arch=x64&channel=stable&version=0.0.1`,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.updateAvailable).toBe(true);
      expect(data.version).toBe("0.0.2");
      expect(data.asset).toBeDefined();
      expect(data.asset.name).toBe("Zenkai-Desktop-v0.0.2-Linux-x64.AppImage");
      expect(data.metadataUrl).toBeDefined();
    });

    it("reports client up-to-date when already on current version", async () => {
      const res = await fetch(
        `${baseUrl}/desktop/v1/updates/latest?platform=linux&arch=x64&channel=stable&version=0.0.2`,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.updateAvailable).toBe(false);
      expect(data.reason).toMatch(/up to date/i);
    });

    it("enforces stable channel: ignores beta pre-releases for stable clients", async () => {
      // Register a newer beta release
      serverInstance.registry.registerRelease({
        ...mockRelease,
        tag: "v0.0.3-beta.1",
        version: "0.0.3-beta.1",
        channel: "beta",
      });

      // Stable client on 0.0.2 should NOT receive 0.0.3-beta.1
      const stableRes = await fetch(
        `${baseUrl}/desktop/v1/updates/latest?platform=linux&arch=x64&channel=stable&version=0.0.2`,
      );
      const stableData = await stableRes.json();
      expect(stableData.updateAvailable).toBe(false);

      // Beta client on 0.0.2 SHOULD receive 0.0.3-beta.1
      const betaRes = await fetch(
        `${baseUrl}/desktop/v1/updates/latest?platform=linux&arch=x64&channel=beta&version=0.0.2`,
      );
      const betaData = await betaRes.json();
      expect(betaData.updateAvailable).toBe(true);
      expect(betaData.version).toBe("0.0.3-beta.1");
      expect(betaData.channel).toBe("beta");
    });
  });

  describe("Staged Rollouts & Emergency Withdrawal", () => {
    it("deterministic cohort distribution remains stable for given installationId", () => {
      const id = "client-installation-uuid-999";
      const c1 = calculateCohort(id, "v0.0.2");
      const c2 = calculateCohort(id, "v0.0.2");
      expect(c1).toBe(c2);
      expect(c1).toBeGreaterThanOrEqual(0);
      expect(c1).toBeLessThan(100);
    });

    it("respects staged rollout percentage", async () => {
      serverInstance.registry.registerRelease({
        ...mockRelease,
        tag: "v0.0.4",
        version: "0.0.4",
        channel: "stable",
        rolloutPercentage: 0, // 0% rollout
      });

      const res = await fetch(
        `${baseUrl}/desktop/v1/updates/latest?platform=linux&arch=x64&channel=stable&version=0.0.1&installationId=test-id-1`,
      );
      const data = await res.json();
      // Should withhold 0.0.4 and deliver 0.0.2 instead
      expect(data.updateAvailable).toBe(true);
      expect(data.version).toBe("0.0.2");
    });

    it("respects emergency release withdrawal immediately", async () => {
      serverInstance.registry.withdrawRelease("v0.0.2");

      const res = await fetch(
        `${baseUrl}/desktop/v1/updates/latest?platform=linux&arch=x64&channel=stable&version=0.0.1`,
      );
      const data = await res.json();
      // v0.0.2 was withdrawn, so it should not be offered
      expect(data.version).not.toBe("0.0.2");
    });
  });

  describe("Health Check", () => {
    it("GET /health returns healthy status", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("healthy");
      expect(data.activeReleasesCount).toBeGreaterThan(0);
    });
  });
});
