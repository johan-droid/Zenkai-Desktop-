import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = await vi.hoisted(async () => {
  const fsM = await import("node:fs");
  const osM = await import("node:os");
  const pathM = await import("node:path");
  const userData = fsM.mkdtempSync(pathM.join(osM.tmpdir(), "zenkai-dl-"));
  const downloadDir = pathM.join(userData, "dl");
  fsM.mkdirSync(downloadDir, { recursive: true });
  return { userData, downloadDir };
});

vi.mock("electron", () => ({
  app: { getPath: () => h.userData },
}));
vi.mock("../../src/main/settings", () => ({
  getSettings: () => ({ downloadDir: h.downloadDir }),
}));

async function freshManager() {
  vi.resetModules();
  return await import("../../src/main/downloads/manager");
}

const indexFile = path.join(h.userData, "downloads.json");

beforeEach(() => {
  fs.rmSync(indexFile, { force: true });
  fs.rmSync(`${indexFile}.tmp`, { force: true });
  for (const f of fs.readdirSync(h.downloadDir)) {
    fs.rmSync(path.join(h.downloadDir, f), { force: true, recursive: true });
  }
});

describe("downloads index (T8)", () => {
  it("corrupt index → ignored, empty list, no throw", async () => {
    fs.writeFileSync(indexFile, "not json{{");
    const m = await freshManager();
    expect(m.listDownloads()).toEqual([]);
  });

  it("malformed (non-array) index → ignored, no throw", async () => {
    fs.writeFileSync(indexFile, JSON.stringify({ evil: true }));
    const m = await freshManager();
    expect(m.listDownloads()).toEqual([]);
  });

  it("interrupted (active) entry resumes as queued with bytes from .part", async () => {
    fs.writeFileSync(
      indexFile,
      JSON.stringify([
        {
          id: "r",
          url: "http://127.0.0.1:1/x",
          name: "video.bin",
          status: "active",
          bytes: 999,
          total: 1000,
        },
      ]),
    );
    fs.writeFileSync(
      path.join(h.downloadDir, "video.bin.part"),
      Buffer.alloc(123),
    );
    const m = await freshManager();
    const [item] = m.listDownloads();
    expect(item.status).toBe("queued");
    expect(item.bytes).toBe(123); // .part is source of truth, not stale index
    expect(item.total).toBe(1000);
  });

  it("queued entry with no URL → error (nothing to resume)", async () => {
    fs.writeFileSync(
      indexFile,
      JSON.stringify([
        { id: "x", name: "a.bin", status: "active", bytes: 0, total: 0 },
      ]),
    );
    const m = await freshManager();
    expect(m.listDownloads()[0]?.status).toBe("error");
  });

  it("done/error entries keep their status across relaunch", async () => {
    fs.writeFileSync(
      indexFile,
      JSON.stringify([
        {
          id: "d",
          url: "http://u",
          name: "done.bin",
          status: "done",
          bytes: 100,
          total: 100,
        },
        {
          id: "e",
          url: "http://u",
          name: "err.bin",
          status: "error",
          bytes: 5,
          total: 100,
        },
      ]),
    );
    const m = await freshManager();
    const list = m.listDownloads();
    expect(list.map((i) => i.status)).toEqual(["done", "error"]);
    expect(list[0]?.bytes).toBe(100);
  });

  it("storageUsage: usedBytes = index byte sum, freeBytes > 0 (statfs)", async () => {
    fs.writeFileSync(
      indexFile,
      JSON.stringify([
        {
          id: "d1",
          url: "http://u",
          name: "a",
          status: "done",
          bytes: 100,
          total: 100,
        },
        {
          id: "d2",
          url: "http://u",
          name: "b",
          status: "done",
          bytes: 250,
          total: 250,
        },
      ]),
    );
    const m = await freshManager();
    m.listDownloads(); // load
    const usage = await m.storageUsage();
    expect(usage.usedBytes).toBe(350);
    expect(usage.freeBytes).toBeGreaterThan(0);
  });

  it("public list never leaks the resume URL", async () => {
    fs.writeFileSync(
      indexFile,
      JSON.stringify([
        {
          id: "d",
          url: "http://u/secret?token=abc",
          name: "f",
          status: "done",
          bytes: 1,
          total: 1,
        },
      ]),
    );
    const m = await freshManager();
    expect(Object.keys(m.listDownloads()[0] ?? {})).toEqual([
      "id",
      "name",
      "status",
      "bytes",
      "total",
    ]);
  });

  it("canFitDownload checks disk space with 15% safety headroom (B3)", async () => {
    const m = await freshManager();
    const fit = await m.canFitDownload(100 * 1024 * 1024);
    expect(fit.requiredBytes).toBe(115 * 1024 * 1024);
    expect(typeof fit.ok).toBe("boolean");
  });

  it("updateTaskbarProgress runs safely without BrowserWindow throwing (B1)", async () => {
    const m = await freshManager();
    expect(() => m.updateTaskbarProgress()).not.toThrow();
  });
});
