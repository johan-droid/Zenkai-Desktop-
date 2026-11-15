import { describe, expect, it, vi } from "vitest";

type Handler = (event: unknown, raw: unknown) => Promise<unknown>;

const { handlers, state } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  state: {
    current: {
      pauseOnClose: true,
      hwDecode: false,
      downloadDir: "/tmp/dl",
      rpcEnabled: true,
      theme: "dark" as const,
      windowState: undefined as
        | {
            x: number;
            y: number;
            width: number;
            height: number;
            maximized: boolean;
          }
        | undefined,
    },
    patches: [] as Record<string, unknown>[],
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
  },
  app: {},
}));

vi.mock("../../src/main/settings", () => ({
  getSettings: () => state.current,
  updateSettings: (patch: Record<string, unknown>) => {
    state.patches.push(patch);
    state.current = { ...state.current, ...patch };
    return state.current;
  },
}));

import "../../src/main/ipc/settings.ipc";

const set = (raw: unknown) => handlers.get("settings:set")!({}, raw);
const get = () => handlers.get("settings:get")!({}, undefined);

describe("settings:set patch semantics (T5)", () => {
  it("empty patch → merges NOTHING (regression: no default leak)", async () => {
    await set({});
    expect(state.patches.at(-1)).toEqual({});
    expect(state.current.theme).toBe("dark"); // untouched
  });

  it("single-key patch → merges only that key", async () => {
    await set({ theme: "light" });
    expect(Object.keys(state.patches.at(-1)!)).toEqual(["theme"]);
    expect(state.current.theme).toBe("light");
    expect(state.current.pauseOnClose).toBe(true); // not reset
  });

  it("full windowState object accepted", async () => {
    await set({
      windowState: { x: 1, y: 2, width: 1111, height: 700, maximized: false },
    });
    expect(state.current.windowState?.width).toBe(1111);
  });

  it("invalid value → throws + logged", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(set({ theme: "neon" })).rejects.toThrow(
      /invalid payload for settings:set/,
    );
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("unknown key → throws + logged", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(set({ evil: 1 })).rejects.toThrow(/invalid payload/);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("settings:get returns current settings", async () => {
    await expect(get()).resolves.toEqual(state.current);
  });
});
