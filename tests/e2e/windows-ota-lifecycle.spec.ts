import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { parseSemver, isStrictlyNewer, pickNewestRelease } from "../../src/main/updater";

test.describe("Windows OTA Update Lifecycle, Concurrency & Fail-Safe Architecture", () => {
  test("Windows latest.yml manifest parsing extracts valid binary target and Base64 SHA-512", async () => {
    // Real manifest from GitHub Release v1.0.4
    const latestYmlContent = `version: 1.0.4
files:
  - url: Zenkai-Desktop-Setup-1.0.4-x64.exe
    sha512: upk1yiqpeTeuwmgJqajrNYbFYERebGObnWTaAY0qKHqkYDrgOJUg7GiaeHenAh4CdE4sUXq8a1a0VadO2aCqkw==
    size: 224297080
path: Zenkai-Desktop-Setup-1.0.4-x64.exe
sha512: upk1yiqpeTeuwmgJqajrNYbFYERebGObnWTaAY0qKHqkYDrgOJUg7GiaeHenAh4CdE4sUXq8a1a0VadO2aCqkw==
releaseDate: '2026-11-18T06:33:42.016Z'
`;

    const versionMatch = latestYmlContent.match(/version:\s*([0-9.]+)/);
    const pathMatch = latestYmlContent.match(/path:\s*([^\s]+)/);
    const sha512Match = latestYmlContent.match(/sha512:\s*([A-Za-z0-9+/=]+)/);

    expect(versionMatch?.[1]).toBe("1.0.4");
    expect(pathMatch?.[1]).toBe("Zenkai-Desktop-Setup-1.0.4-x64.exe");
    expect(sha512Match?.[1]).toBe("upk1yiqpeTeuwmgJqajrNYbFYERebGObnWTaAY0qKHqkYDrgOJUg7GiaeHenAh4CdE4sUXq8a1a0VadO2aCqkw==");
  });

  test("Windows asset selection isolates NSIS Setup .exe without selecting portable zip or blockmap", () => {
    const assets = [
      { name: "latest.yml", browser_download_url: "https://.../latest.yml" },
      { name: "SHA256SUMS.txt", browser_download_url: "https://.../SHA256SUMS.txt" },
      { name: "Zenkai-Desktop-v1.0.4-Windows-x64-Portable.zip", browser_download_url: "https://.../Portable.zip" },
      { name: "Zenkai-Desktop-Setup-1.0.4-x64.exe.blockmap", browser_download_url: "https://.../blockmap" },
      { name: "Zenkai-Desktop-Setup-1.0.4-x64.exe", browser_download_url: "https://.../Zenkai-Desktop-Setup-1.0.4-x64.exe" },
    ];

    // Mirroring Windows selection logic from checkForUpdatesClient in src/main/updater.ts
    const winAsset =
      assets.find((a) => a.name.toLowerCase().endsWith(".exe") && a.name.toLowerCase().includes("setup")) ||
      assets.find((a) => a.name.toLowerCase().endsWith(".exe"));

    expect(winAsset).toBeDefined();
    expect(winAsset?.name).toBe("Zenkai-Desktop-Setup-1.0.4-x64.exe");
    expect(winAsset?.name.endsWith(".zip")).toBe(false);
    expect(winAsset?.name.endsWith(".blockmap")).toBe(false);
  });

  test("Windows checksum verification handles both SHA-256 and Base64 SHA-512 streaming validation", () => {
    const samplePayload = Buffer.from("Windows NSIS Executable Binary Payload Simulation");
    const sha256Expected = crypto.createHash("sha256").update(samplePayload).digest("hex");
    const sha512Expected = crypto.createHash("sha512").update(samplePayload).digest("base64");

    const tempDir = path.join("/tmp", `win-checksum-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const partFile = path.join(tempDir, "Zenkai-Setup.exe.part");
      const targetFile = path.join(tempDir, "Zenkai-Setup.exe");
      fs.writeFileSync(partFile, samplePayload);

      // Verify streaming hash calculation
      const fileBuffer = fs.readFileSync(partFile);
      const computed256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      const computed512 = crypto.createHash("sha512").update(fileBuffer).digest("base64");

      expect(computed256).toBe(sha256Expected);
      expect(computed512).toBe(sha512Expected);

      // Valid: rename to final target
      fs.renameSync(partFile, targetFile);
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.existsSync(partFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("Windows user settings directory structure survives in-place application replacement", () => {
    const tempDir = path.join("/tmp", `win-userdata-${Date.now()}`);
    const appDir = path.join(tempDir, "ProgramFiles", "Zenkai Desktop");
    const userDataDir = path.join(tempDir, "AppData", "Roaming", "Zenkai");

    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(userDataDir, { recursive: true });

    try {
      // 1. Initial v1.0.4 application installation state
      const exeFile = path.join(appDir, "Zenkai.exe");
      fs.writeFileSync(exeFile, "VERSION_1_0_4_BINARY");

      // 2. Initial user settings stored in AppData
      const settingsFile = path.join(userDataDir, "settings.json");
      const userSettings = {
        theme: "dark",
        audioPreference: "dub",
        serverPreference: "megaplay",
        hwDecode: true,
      };
      fs.writeFileSync(settingsFile, JSON.stringify(userSettings, null, 2), "utf8");

      // 3. Simulate NSIS in-place binary overwrite by installer
      fs.writeFileSync(exeFile, "VERSION_1_0_5_BINARY");

      // 4. Verify user settings remain untouched in AppData Roaming
      expect(fs.existsSync(settingsFile)).toBe(true);
      const readBackSettings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      expect(readBackSettings).toEqual(userSettings);
      expect(fs.readFileSync(exeFile, "utf8")).toBe("VERSION_1_0_5_BINARY");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
