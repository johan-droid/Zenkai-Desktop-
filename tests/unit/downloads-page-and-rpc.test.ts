import { describe, expect, it, vi } from "vitest";

type Handler = (event: unknown, raw: unknown) => Promise<unknown>;

const { rpcCalls, handlers } = vi.hoisted(() => ({
  rpcCalls: {
    set: [] as unknown[],
    cleared: 0,
  },
  handlers: new Map<string, Handler>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
  },
  app: {},
}));

vi.mock("../../src/main/discord-rpc", () => ({
  setRpcActivity: (data: unknown) => {
    rpcCalls.set.push(data);
  },
  clearRpcActivity: () => {
    rpcCalls.cleared++;
  },
}));

import "../../src/main/ipc/rpc.ipc";

describe("Phase 1 & 2 Integration: Discord RPC & Offline Downloads IPC", () => {
  it("rpc:set accepts valid activity payload and calls setRpcActivity", async () => {
    const handler = handlers.get("rpc:set");
    expect(handler).toBeDefined();

    await handler!({}, {
      title: "One Piece",
      details: "Episode 1000",
      startedAt: 1700000000000,
    });

    expect(rpcCalls.set.length).toBe(1);
    expect(rpcCalls.set[0]).toEqual({
      title: "One Piece",
      details: "Episode 1000",
      startedAt: 1700000000000,
    });
  });

  it("rpc:set rejects empty title with schema validation error", async () => {
    const handler = handlers.get("rpc:set");
    await expect(handler!({}, { title: "" })).rejects.toThrow("invalid payload for rpc:set");
  });

  it("rpc:clear succeeds and clears activity", async () => {
    const handler = handlers.get("rpc:clear");
    expect(handler).toBeDefined();

    await handler!({}, undefined);
    expect(rpcCalls.cleared).toBe(1);
  });

  it("rpc:clear rejects invalid arguments with error", async () => {
    const handler = handlers.get("rpc:clear");
    await expect(handler!({}, { unexpected: true })).rejects.toThrow("invalid payload for rpc:clear");
  });
});
