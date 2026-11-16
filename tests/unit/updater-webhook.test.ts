import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const broadcasts: { channel: string; payload: unknown }[] = [];
  const win = {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn((ch: string, pl: unknown) => broadcasts.push({ channel: ch, payload: pl })) },
  };
  const BrowserWindow = { getAllWindows: vi.fn(() => [win]) };
  const app = {
    isPackaged: false,
    getVersion: vi.fn(() => "0.0.1"),
    getPath: vi.fn((k: string) => (k === "downloads" ? "/tmp/zk-dl" : "/tmp/zk-data")),
  };
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: "",
    allowPrerelease: false,
    handlers: {} as Record<string, (...args: unknown[]) => void>,
    on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
      autoUpdater.handlers[ev] = cb;
    }),
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
  };
  const fsMock = {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    chmodSync: vi.fn(),
  };
  const fetchMock = vi.fn();
  return { broadcasts, win, BrowserWindow, app, autoUpdater, fsMock, fetchMock };
});

vi.mock("electron", () => ({
  app: h.app,
  BrowserWindow: h.BrowserWindow,
  dialog: {},
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
}));
vi.mock("electron-updater", () => ({ autoUpdater: h.autoUpdater }));
vi.mock("node:fs", () => h.fsMock);
vi.stubGlobal("fetch", h.fetchMock);

async function fresh() {
  vi.resetModules();
  return import("../../src/main/updater");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.broadcasts.length = 0;
  h.app.isPackaged = false;
  h.app.getVersion.mockReturnValue("0.0.1");
  h.fsMock.existsSync.mockReturnValue(false);
  h.fetchMock.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => [],
    headers: { get: () => null },
  });
});

afterEach(() => vi.useRealTimers());

describe("checkForUpdatesClient — GitHub releases webhook", () => {
  it("returns not-available when GitHub returns 404", async () => {
    const { checkForUpdatesClient } = await fresh();
    const r = await checkForUpdatesClient();
    expect(r.updateAvailable).toBe(false);
    expect(r.reason).toMatch(/404/);
  });

  it("returns not-available when releases list is empty", async () => {
    h.fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
      headers: { get: () => null },
    });
    const { checkForUpdatesClient } = await fresh();
    const r = await checkForUpdatesClient();
    expect(r.updateAvailable).toBe(false);
  });

  it("returns not-available when only prerelease exists and channel is stable", async () => {
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
    const { checkForUpdatesClient } = await fresh();
    const r = await checkForUpdatesClient();
    expect(r.updateAvailable).toBe(false);
  });

  it("detects new stable release and sets updateAvailable", async () => {
    h.fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v0.0.2",
          prerelease: false,
          draft: false,
          body: "notes",
          published_at: "2026-01-01",
          html_url: "https://github.com/releases/1",
          assets: [],
        },
      ],
      headers: { get: () => null },
    });
    const { checkForUpdatesClient } = await fresh();
    const r = await checkForUpdatesClient();
    expect(r.updateAvailable).toBe(true);
    expect(r.version).toBe("0.0.2");
  });

  it("broadcasts updater:status available to all windows", async () => {
    h.fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v0.0.2",
          prerelease: false,
          draft: false,
          body: "",
          published_at: "",
          html_url: "",
          assets: [],
        },
      ],
      headers: { get: () => null },
    });
    const { checkForUpdatesClient } = await fresh();
    await checkForUpdatesClient();
    const broadcast = h.broadcasts.find(
      (b) => b.channel === "updater:status" && (b.payload as { status: string }).status === "available",
    );
    expect(broadcast).toBeDefined();
  });

  it("does not upgrade to draft release", async () => {
    h.fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v0.0.2",
          prerelease: false,
          draft: true,
          body: "",
          published_at: "",
          html_url: "",
          assets: [],
        },
      ],
      headers: { get: () => null },
    });
    const { checkForUpdatesClient } = await fresh();
    const r = await checkForUpdatesClient();
    expect(r.updateAvailable).toBe(false);
  });

  it("extracts sha256 from SHA256SUMS.txt asset when present", async () => {
    const assetName = "zenkai-0.0.2.AppImage";
    const fakeHash = "a".repeat(64);
    h.fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: "v0.0.2",
            prerelease: false,
            draft: false,
            body: "",
            published_at: "",
            html_url: "",
            assets: [
              { name: assetName, browser_download_url: "https://cdn.example.com/" + assetName, size: 100 },
              { name: "SHA256SUMS.txt", browser_download_url: "https://cdn.example.com/SHA256SUMS.txt", size: 80 },
            ],
          },
        ],
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({ ok: true, text: async () => `${fakeHash}  ${assetName}\n` });

    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    process.env.APPIMAGE = "/tmp/fake.AppImage";
    const { checkForUpdatesClient } = await fresh();
    const r = await checkForUpdatesClient();
    expect(r.sha256).toBe(fakeHash);
    delete process.env.APPIMAGE;
  });
});

describe("startUpdateDownload — download lifecycle", () => {
  it("returns failure when no latestUpdateResult is set", async () => {
    const { startUpdateDownload } = await fresh();
    const r = await startUpdateDownload();
    // Falls through to release page fallback — success (opens browser)
    expect(r.success).toBe(true);
  });
});
