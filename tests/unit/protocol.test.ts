import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const win = {
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  };
  const app = {
    setAsDefaultProtocolClient: vi.fn(() => true),
    requestSingleInstanceLock: vi.fn(() => true),
    on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
      listeners[ev] = cb;
    }),
    quit: vi.fn(),
  };
  return { listeners, win, app };
});

vi.mock("electron", () => ({
  app: h.app,
  BrowserWindow: { getAllWindows: () => [h.win] },
}));

import {
  findDeepLink,
  handleDeepLink,
  registerProtocol,
} from "../../src/main/protocol";

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  h.app.setAsDefaultProtocolClient.mockReturnValue(true);
  h.app.requestSingleInstanceLock.mockReturnValue(true);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

const allLogged = () =>
  [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
    .flat()
    .join(" ");

describe("deep links (T11)", () => {
  it("registers zenkai:// + single-instance lock + both link listeners", () => {
    registerProtocol();
    expect(h.app.setAsDefaultProtocolClient).toHaveBeenCalledWith("zenkai");
    expect(h.app.requestSingleInstanceLock).toHaveBeenCalled();
    expect(h.listeners["second-instance"]).toBeTypeOf("function");
    expect(h.listeners["open-url"]).toBeTypeOf("function");
    expect(h.app.quit).not.toHaveBeenCalled();
  });

  it("second instance without lock → quits immediately", () => {
    h.app.requestSingleInstanceLock.mockReturnValue(false);
    registerProtocol();
    expect(h.app.quit).toHaveBeenCalled();
  });

  it("auth link → focus + auth:callback with token", () => {
    handleDeepLink("zenkai://auth?token=SECRET123");
    expect(h.win.show).toHaveBeenCalled();
    expect(h.win.focus).toHaveBeenCalled();
    expect(h.win.webContents.send).toHaveBeenCalledWith("auth:callback", {
      token: "SECRET123",
    });
  });

  it("token is never logged (redaction)", () => {
    handleDeepLink("zenkai://auth?token=SECRET123");
    handleDeepLink("zenkai://auth?token=SECRET123&x=1");
    expect(allLogged()).not.toContain("SECRET123");
    expect(allLogged()).toContain("redacted");
  });

  it("link without token → focus only, no auth event", () => {
    handleDeepLink("zenkai://test");
    expect(h.win.focus).toHaveBeenCalled();
    expect(h.win.webContents.send).not.toHaveBeenCalled();
  });

  it("non-zenkai URL → ignored entirely", () => {
    handleDeepLink("http://evil.example/?token=SECRET123");
    expect(h.win.show).not.toHaveBeenCalled();
    expect(h.win.webContents.send).not.toHaveBeenCalled();
    expect(allLogged()).not.toContain("SECRET123");
  });

  it("malformed URL → no throw, nothing sensitive logged", () => {
    expect(() => handleDeepLink("zenkai://\u0000bad token")).not.toThrow();
    expect(h.win.webContents.send).not.toHaveBeenCalled();
    expect(allLogged()).not.toContain("bad token");
  });

  it("findDeepLink picks the zenkai:// arg out of argv", () => {
    expect(
      findDeepLink(["/electron", ".", "--foo", "zenkai://auth?token=t"]),
    ).toBe("zenkai://auth?token=t");
    expect(findDeepLink(["/electron", "."])).toBeUndefined();
  });

  it("second-instance event with link → handled; without → focus only", () => {
    registerProtocol();
    h.listeners["second-instance"]!({}, [
      "/electron",
      ".",
      "zenkai://auth?token=SECRET123",
    ]);
    expect(h.win.webContents.send).toHaveBeenCalledWith("auth:callback", {
      token: "SECRET123",
    });
    h.win.webContents.send.mockClear();
    h.listeners["second-instance"]!({}, ["/electron", "."]);
    expect(h.win.focus).toHaveBeenCalled();
    expect(h.win.webContents.send).not.toHaveBeenCalled();
  });

  it("open-url (macOS) → handled, event default prevented", () => {
    registerProtocol();
    const event = { preventDefault: vi.fn() };
    h.listeners["open-url"]!(event, "zenkai://auth?token=SECRET123");
    expect(event.preventDefault).toHaveBeenCalled();
    expect(h.win.webContents.send).toHaveBeenCalledWith("auth:callback", {
      token: "SECRET123",
    });
  });
});
