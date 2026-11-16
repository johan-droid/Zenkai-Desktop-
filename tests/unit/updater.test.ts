import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T14 — auto-updater decision branches (electron-updater mocked; no network).
const h = vi.hoisted(() => {
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: "" as string,
    handlers: {} as Record<string, (...args: unknown[]) => void>,
    on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
      autoUpdater.handlers[ev] = cb;
    }),
    checkForUpdates: vi.fn(async () => undefined),
  };
  const app = {
    isPackaged: true,
    getVersion: vi.fn(() => "0.0.1"),
    getPath: vi.fn(() => "/tmp/zenkai-test-data"),
  };
  const fetchMock = vi.fn();
  const BrowserWindow = {
    getAllWindows: vi.fn(() => []),
  };
  return { autoUpdater, app, fetchMock, BrowserWindow };
});

vi.mock("electron", () => ({
  app: h.app,
  BrowserWindow: h.BrowserWindow,
  dialog: {},
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
}));
vi.mock("electron-updater", () => ({ autoUpdater: h.autoUpdater }));
vi.stubGlobal("fetch", h.fetchMock);

const ORIG_PLATFORM = process.platform;

async function freshSetup(): Promise<typeof import("../../src/main/updater")> {
  vi.resetModules();
  return await import("../../src/main/updater");
}

const setPlatform = (p: NodeJS.Platform): void => {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
};

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  h.app.isPackaged = true;
  h.app.getVersion.mockReturnValue("0.0.1");
  h.autoUpdater.autoDownload = false;
  h.autoUpdater.autoInstallOnAppQuit = false;
  h.autoUpdater.channel = "";
  h.autoUpdater.handlers = {};
  h.fetchMock.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => [],
    headers: { get: () => null },
    body: null,
  });
  delete process.env.APPLE_ID;
  delete process.env.APPIMAGE;
  setPlatform("linux");
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setPlatform(ORIG_PLATFORM);
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

const logged = () =>
  [...logSpy.mock.calls, ...warnSpy.mock.calls].flat().join(" ");

describe("auto-updater decisions (T14)", () => {
  it("development (not packaged) → skipped, updater untouched", async () => {
    h.app.isPackaged = false;
    const { setupAutoUpdater } = await freshSetup();
    setupAutoUpdater();
    expect(logged()).toMatch(/not packaged/);
    expect(h.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.autoUpdater.on).not.toHaveBeenCalled();
  });

  it("macOS unsigned (B4, no APPLE_ID) → disabled with log, no checks", async () => {
    setPlatform("darwin");
    const { setupAutoUpdater } = await freshSetup();
    setupAutoUpdater();
    expect(logged()).toMatch(/unsigned \(B4\).*disabled/i);
    expect(h.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("linux .deb/.rpm (no APPIMAGE) → no-op banner, no checks", async () => {
    const { setupAutoUpdater } = await freshSetup();
    setupAutoUpdater();
    expect(logged()).toMatch(/native Linux package/);
    expect(h.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("AppImage → full update path: flags set, launch check runs, events wired", async () => {
    process.env.APPIMAGE = "/tmp/Zenkai.AppImage";
    const { setupAutoUpdater } = await freshSetup();
    setupAutoUpdater();
    expect(h.autoUpdater.autoDownload).toBe(false);
    expect(h.autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    for (const ev of [
      "checking-for-update",
      "update-available",
      "update-not-available",
      "update-downloaded",
      "error",
    ]) {
      expect(h.autoUpdater.handlers[ev]).toBeTypeOf("function");
    }
    delete process.env.APPIMAGE;
  });

  it("AppImage → recurring check every 6h (not sooner)", async () => {
    process.env.APPIMAGE = "/tmp/Zenkai.AppImage";
    const { setupAutoUpdater } = await freshSetup();
    setupAutoUpdater();
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000); // 5h
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // → 6h
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    delete process.env.APPIMAGE;
  });

  it("channel: latest by default, beta when version carries -beta", async () => {
    process.env.APPIMAGE = "/tmp/Zenkai.AppImage";
    const { setupAutoUpdater } = await freshSetup();
    setupAutoUpdater();
    expect(h.autoUpdater.channel).toBe("latest");

    h.app.getVersion.mockReturnValue("0.0.2-beta.1");
    const fresh = await freshSetup();
    fresh.setupAutoUpdater();
    expect(h.autoUpdater.channel).toBe("beta");
    delete process.env.APPIMAGE;
  });

  it("update check failure → warned, never thrown (AppImage 404 case)", async () => {
    process.env.APPIMAGE = "/tmp/Zenkai.AppImage";
    h.autoUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error("HttpError: 404"),
    );
    const { setupAutoUpdater } = await freshSetup();
    expect(() => setupAutoUpdater()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(logged()).toMatch(/initial check failed.*404/);
    delete process.env.APPIMAGE;
    h.autoUpdater.checkForUpdates.mockResolvedValue(undefined);
  });

  it("active playback guard: applyUpdateAndRestart throws when media playback is active", async () => {
    const { applyUpdateAndRestart } = await freshSetup();
    const { setPlaybackState } = await import("../../src/main/playback");
    setPlaybackState(true);

    await expect(applyUpdateAndRestart()).rejects.toThrow(/media playback is in progress/);
    setPlaybackState(false);
  });

  it("active playback guard: startUpdateDownload defers when media playback is active", async () => {
    const { startUpdateDownload } = await freshSetup();
    const { setPlaybackState } = await import("../../src/main/playback");
    setPlaybackState(true);

    const res = await startUpdateDownload();
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/media playback is in progress/);
    setPlaybackState(false);
  });

  it("downgrade prevention & semver comparison (Phase 8)", async () => {
    const { isStrictlyNewer } = await freshSetup();
    expect(isStrictlyNewer("0.0.2", "0.0.1")).toBe(true);
    expect(isStrictlyNewer("0.1.0", "0.0.9")).toBe(true);
    expect(isStrictlyNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isStrictlyNewer("0.0.1", "0.0.1")).toBe(false);
    expect(isStrictlyNewer("0.0.1", "0.0.2")).toBe(false); // downgrade rejected
    expect(isStrictlyNewer("0.0.2", "0.0.2-beta.1")).toBe(true); // stable newer than beta
    expect(isStrictlyNewer("0.0.2-beta.1", "0.0.2")).toBe(false); // beta not newer than stable
  });

  it("local update diagnostics provides privacy-first observability (Phase 11)", async () => {
    const { getUpdateDiagnostics } = await freshSetup();
    const diag = getUpdateDiagnostics();
    expect(diag).toBeDefined();
    expect(diag.currentVersion).toBe("0.0.1");
    expect(diag.channel).toBe("stable");
    expect(diag.downloadState).toBe("idle");
    expect(diag.verificationState).toBe("none");
    expect(diag.installationState).toBe("idle");
  });

  it("stable channel ignores prerelease-only releases (Issue D)", async () => {
    h.fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v0.0.2-beta.1",
          prerelease: true,
          draft: false,
          body: "",
          published_at: "",
          html_url: "",
          assets: [],
        },
      ],
      headers: { get: () => null },
    });
    const { checkForUpdatesClient } = await freshSetup();
    const result = await checkForUpdatesClient();
    expect(result.updateAvailable).toBe(false);
  });

  it("checkForUpdatesClient returns not-available on GitHub API non-200 (3f)", async () => {
    h.fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => [],
      headers: { get: () => null },
    });
    const { checkForUpdatesClient } = await freshSetup();
    const result = await checkForUpdatesClient();
    expect(result.updateAvailable).toBe(false);
    expect(result.reason).toMatch(/429/);
  });
});
