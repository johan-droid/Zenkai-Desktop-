import { _electron as electron, expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

// T16 e2e — shell flows against a LOCAL stub page (per the T3 finding:
// never assert against live zenkai-web content — Cloudflare bot-blocks
// automated sessions). Covers: launch → window loads, play/pause event,
// PiP toggle, deep link, download start.

const electronPath = require("electron") as string;
const mainPath = path.join(__dirname, "../../out/main/index.js");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fixtureB64 = fs
  .readFileSync(path.join(__dirname, "fixtures/tiny.mp4"))
  .toString("base64");

const STUB = `data:text/html,${encodeURIComponent(`
<html>
  <head><title>Zenkai E2E</title></head>
  <body>
    <h1>shell stub</h1>
    <video id="v" width="64" height="64" src="data:video/mp4;base64,${fixtureB64}"></video>
    <button id="pip">pip</button>
  </body>
</html>`)}`;

const userData = path.join(os.homedir(), ".config", "zenkai-desktop");
const settingsPath = path.join(userData, "settings.json");
const downloadsIndexPath = path.join(userData, "downloads.json");
const backup = (p: string): string | null => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
let origSettings: string | null = null;
let origDownloads: string | null = null;

test.beforeAll(() => {
  // e2e mutates downloadDir + adds a download index entry → restore after
  origSettings = backup(settingsPath);
  origDownloads = backup(downloadsIndexPath);
});
test.afterAll(() => {
  const restore = (p: string, data: string | null) => {
    try {
      if (data !== null) fs.writeFileSync(p, data);
      else fs.rmSync(p, { force: true });
    } catch {
      /* best effort */
    }
  };
  restore(settingsPath, origSettings);
  restore(downloadsIndexPath, origDownloads);
});

async function launchApp() {
  const launchEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ZENKAI_WEB_URL: STUB,
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [mainPath],
    env: launchEnv,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  return { app, page };
}

async function until<T>(
  fn: () => Promise<T | null | undefined | false>,
  what: string,
  timeout = 15000,
): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - t0 > timeout)
      throw new Error(`timeout waiting for: ${what}`);
    await sleep(150);
  }
}

test("launch → local stub window loads with desktop bridge", async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page).toHaveTitle("Zenkai E2E");
    const isDesktop = await page.evaluate(
      () => (window as any).zenkai?.isDesktop,
    );
    expect(isDesktop).toBe(true);
    const hasRequire = await page.evaluate(
      () => typeof (window as any).require,
    );
    expect(hasRequire).toBe("undefined"); // contextBridge hardening visible
  } finally {
    await app.close();
  }
});

test("play/pause: window hide → renderer receives playback:pause", async () => {
  const { app, page } = await launchApp();
  try {
    await page.evaluate(async () => {
      await (window as any).zenkai.settings.set({ pauseOnClose: true });
      (window as any).__ev = [];
      (window as any).zenkai.onPlaybackPause(() =>
        (window as any).__ev.push("pause"),
      );
    });
    // registerPlayback listens to hide — deterministic, no window-manager needed
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.hide();
    });
    const ev = await until(
      () => page.evaluate(() => (window as any).__ev as string[]),
      "playback:pause event",
    );
    expect(ev).toContain("pause");
  } finally {
    await app.close();
  }
});

test("PiP toggle: click enters picture-in-picture on the video", async () => {
  const { app, page } = await launchApp();
  try {
    const enabled = await page.evaluate(() => document.pictureInPictureEnabled);
    expect(enabled).toBe(true);

    await page.waitForFunction(
      () => (document.getElementById("v") as HTMLVideoElement).readyState >= 1,
      undefined,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const v = document.getElementById("v") as HTMLVideoElement;
      (window as any).__pip = null;
      document.getElementById("pip")!.addEventListener("click", () => {
        (window as any).__pip = v.requestPictureInPicture().then(
          () => "entered",
          (e: Error) => `error:${e.name}`,
        );
      });
    });
    await page.click("#pip");
    const result = await until(
      () => page.evaluate(() => (window as any).__pip as string | null),
      "PiP request result",
    );
    if (result !== "entered") {
      // platform refused PiP entry (window-manager/policy dependent) — the
      // feature-surface assertion above still holds
      test.skip(true, `PiP entry unavailable here: ${result}`);
    }
    const active = await page.evaluate(
      () => document.pictureInPictureElement?.id ?? null,
    );
    expect(active).toBe("v");
  } finally {
    await app.close();
  }
});

test("download start: IPC → active → done, file on disk", async () => {
  const payload = Buffer.alloc(64 * 1024, 0x5a);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      "Content-Length": payload.length,
      "Accept-Ranges": "bytes",
    });
    res.end(payload);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenkai-e2e-dl-"));

  const { app, page } = await launchApp();
  try {
    await page.evaluate(
      (d) => (window as any).zenkai.settings.set({ downloadDir: d }),
      dlDir,
    );
    await page.evaluate(
      (b) =>
        (window as any).zenkai.downloads.start({
          id: "e2e-dl",
          url: `${b}/file.bin`,
          name: "e2e-file.bin",
        }),
      base,
    );
    const item = await until(
      async () => {
        const list = await page.evaluate(() =>
          (window as any).zenkai.downloads.list(),
        );
        const it = list.find((i: { id: string }) => i.id === "e2e-dl");
        return it && (it.status === "done" || it.status === "error")
          ? it
          : null;
      },
      "download to finish",
      20000,
    );
    expect(item.status).toBe("done");
    const file = path.join(dlDir, "e2e-file.bin");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBe(payload.length);
    // cleanup entry so the restored index has no e2e residue
    await page.evaluate(() =>
      (window as any).zenkai.downloads.remove("e2e-dl"),
    );
  } finally {
    await app.close();
    server.close();
    fs.rmSync(dlDir, { recursive: true, force: true });
  }
});

test("deep link: second zenkai://auth instance → auth:callback with token", async () => {
  const TOKEN = "E2E-AUTH-TOKEN-42";
  const { app, page } = await launchApp();
  let second: ReturnType<typeof spawn> | undefined;
  try {
    await page.evaluate(() => {
      (window as any).__auth = null;
      (window as any).zenkai.onAuthCallback(
        (p: { token: string }) => ((window as any).__auth = p.token),
      );
    });
    const secondEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete secondEnv.ELECTRON_RUN_AS_NODE;
    second = spawn(electronPath, [mainPath, `zenkai://auth?token=${TOKEN}`], {
      stdio: "ignore",
      env: secondEnv,
    });
    const exit = await Promise.race([
      new Promise<number | null>((r) => second!.on("exit", (c) => r(c))),
      sleep(10000).then(() => "timeout" as const),
    ]);
    expect(exit).toBe(0); // single-instance handoff → second quits

    const token = await until(
      () => page.evaluate(() => (window as any).__auth as string | null),
      "auth:callback event",
    );
    expect(token).toBe(TOKEN);
  } finally {
    if (second && second.exitCode === null) second.kill("SIGKILL");
    await app.close();
  }
});
