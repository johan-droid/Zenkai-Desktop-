import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupCanaryHealthCheck } from "../../src/main/renderer-updater";

describe("OTA Canary Health Check (5-Second Safety Net)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no-ops for bundled non-OTA renderer paths", () => {
    const mockWin = {
      isDestroyed: () => false,
      webContents: {
        once: vi.fn(),
        removeListener: vi.fn(),
      },
    } as unknown as import("electron").BrowserWindow;

    const cleanup = setupCanaryHealthCheck(mockWin, "/app/dist/renderer/index.html");
    expect(mockWin.webContents.once).not.toHaveBeenCalled();
    cleanup();
  });

  it("attaches crash and fail-load listeners for OTA renderer updates", () => {
    const listeners: Record<string, Function> = {};
    const mockWin = {
      isDestroyed: () => false,
      webContents: {
        once: vi.fn((ev: string, cb: Function) => {
          listeners[ev] = cb;
        }),
        removeListener: vi.fn(),
      },
      loadFile: vi.fn(),
    } as unknown as import("electron").BrowserWindow;

    const cleanup = setupCanaryHealthCheck(mockWin, "/userData/renderer-updates/active/index.html");
    expect(mockWin.webContents.once).toHaveBeenCalledWith("render-process-gone", expect.any(Function));
    expect(mockWin.webContents.once).toHaveBeenCalledWith("did-fail-load", expect.any(Function));

    // After 5s without failure, listeners are cleaned up
    vi.advanceTimersByTime(5000);
    expect(mockWin.webContents.removeListener).toHaveBeenCalled();
    cleanup();
  });
});
