import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: unknown, raw: unknown) => Promise<unknown>;

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
  },
  app: { getVersion: () => "0.0.1" },
}));

import "../../src/main/ipc/app.ipc";

describe("ipc handlers (T4)", () => {
  beforeEach(() => {
    // NOTE: handlers register once at import (side effect) — do not clear here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("registers only known channels", async () => {
    expect([...handlers.keys()]).toEqual(["app:version"]);
  });

  it("app:version returns the app version", async () => {
    const fn = handlers.get("app:version")!;
    await expect(fn({}, undefined)).resolves.toBe("0.0.1");
  });

  it("invalid payload → throws, logged, main does not crash", async () => {
    const errSpy = vi.spyOn(console, "error");
    const fn = handlers.get("app:version")!;
    await expect(fn({}, { junk: true })).rejects.toThrow(/invalid payload/);
    expect(errSpy).toHaveBeenCalled();
    // handler map still intact → main process survived
    expect(handlers.has("app:version")).toBe(true);
  });
});
