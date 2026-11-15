import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type Handler = () => void;
  const win = {
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  };
  const state = {
    supported: true,
    instances: [] as Array<{
      opts: { title: string; body?: string; silent?: boolean };
      handlers: Record<string, Handler>;
      shown: boolean;
    }>,
  };
  class FakeNotification {
    opts: { title: string; body?: string; silent?: boolean };
    handlers: Record<string, Handler> = {};
    shown = false;
    constructor(opts: { title: string; body?: string; silent?: boolean }) {
      this.opts = opts;
      state.instances.push(this);
    }
    static isSupported(): boolean {
      return state.supported;
    }
    on(ev: string, cb: Handler): this {
      this.handlers[ev] = cb;
      return this;
    }
    show(): void {
      this.shown = true;
    }
  }
  return { win, state, FakeNotification };
});

vi.mock("electron", () => ({
  Notification: h.FakeNotification,
  BrowserWindow: { getAllWindows: () => [h.win] },
}));

import { showNotification } from "../../src/main/notify";

beforeEach(() => {
  h.state.supported = true;
  h.state.instances.length = 0;
  vi.clearAllMocks();
});

describe("notifications (T10)", () => {
  it("shows with silent:false and the given title/body", () => {
    showNotification({
      id: "dl1",
      title: "Download complete",
      body: "ep1.mkv",
    });
    expect(h.state.instances).toHaveLength(1);
    const n = h.state.instances[0]!;
    expect(n.opts).toEqual({
      title: "Download complete",
      body: "ep1.mkv",
      silent: false,
    });
    expect(n.shown).toBe(true);
  });

  it("click → focuses window and sends notify:click with the id", () => {
    showNotification({ id: "dl42", title: "t" });
    const n = h.state.instances[0]!;
    n.handlers["click"]!();
    expect(h.win.show).toHaveBeenCalled();
    expect(h.win.focus).toHaveBeenCalled();
    expect(h.win.webContents.send).toHaveBeenCalledWith("notify:click", {
      id: "dl42",
    });
  });

  it("click → restores a minimized window first", () => {
    h.win.isMinimized.mockReturnValue(true);
    showNotification({ id: "x", title: "t" });
    h.state.instances[0]!.handlers["click"]!();
    expect(h.win.restore).toHaveBeenCalled();
    h.win.isMinimized.mockReturnValue(false);
  });

  it("unsupported (no libnotify) → no-op, no instance created", () => {
    h.state.supported = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    showNotification({ id: "a", title: "t" });
    showNotification({ id: "b", title: "t" });
    expect(h.state.instances).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1); // log once, not per call
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/unsupported/);
    warn.mockRestore();
  });
});
