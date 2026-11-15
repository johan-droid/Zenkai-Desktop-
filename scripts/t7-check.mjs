// T7 acceptance check — run: node scripts/t7-check.mjs
// 1. web-layer §8.3 keys (Space, PiP, next/prev, settings) reach the renderer
// 2. menu accelerators exist per §8.3 and their actions fire (reload/fullscreen/devtools)
// 3. tray initializes gracefully (created or warned) without crashing — Linux path
import { createRequire } from "node:module";
import { _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const executablePath = require("electron");

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Phase A: tray — spawn with stdio captured from birth (startup logs are
// emitted before any post-launch listener could attach) ---
{
  const { spawn } = await import("node:child_process");
  const p = spawn("node_modules/electron/dist/electron", ["."], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  await sleep(7000);
  const alive = p.exitCode === null;
  const trayCreated = /\[tray\] created/.test(log);
  const traySkipped = /\[tray\] (icon not found|unsupported)/.test(log);
  check(
    "tray graceful on Linux (created or warned, no crash)",
    alive && (trayCreated || traySkipped),
    trayCreated
      ? "created"
      : traySkipped
        ? "skipped with warning"
        : `no tray log: ${log.slice(0, 200)}`,
  );
  check("app alive after menu/tray init (direct spawn)", alive);
  p.kill("SIGTERM");
  await sleep(500);
}

// --- Phase B: keys + menu via Playwright ---
let app;
try {
  app = await electron.launch({ executablePath, args: ["."] });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await sleep(2000);

  // --- 1. web-held keys reach renderer (no menu consumes them) ---
  await page.evaluate(() => {
    window.__keys = [];
    document.addEventListener("keydown", (e) =>
      window.__keys.push({
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
      }),
    );
  });
  await page.keyboard.press("Space");
  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.press("Control+ArrowRight");
  await page.keyboard.press("Control+ArrowLeft");
  await page.keyboard.press("Control+Comma");
  const keys = await page.evaluate(() => window.__keys);
  const has = (code, extra = () => true) =>
    keys.some((k) => k.code === code && extra(k));
  check(
    "Space reaches web layer",
    has("Space", (k) => k.key === " "),
  );
  check(
    "Ctrl+Shift+P (PiP) reaches web layer",
    has("KeyP", (k) => k.ctrl && k.shift),
  );
  check(
    "Ctrl+Right (next ep) reaches web layer",
    has("ArrowRight", (k) => k.ctrl),
  );
  check(
    "Ctrl+Left (prev ep) reaches web layer",
    has("ArrowLeft", (k) => k.ctrl),
  );
  check(
    "Ctrl+, (settings) reaches web layer",
    has("Comma", (k) => k.ctrl),
  );

  // --- 2. menu structure + actions ---
  const menu = await app.evaluate(({ Menu }) => {
    const walk = (items, out = []) => {
      for (const i of items) {
        out.push({
          id: i.id,
          label: i.label,
          accelerator: i.accelerator,
          visible: i.visible,
        });
        if (i.submenu) walk(i.submenu.items ?? [], out);
      }
      return out;
    };
    return walk(Menu.getApplicationMenu()?.items ?? []);
  });
  const item = (id) => menu.find((m) => m.id === id);
  check(
    "menu accelerator Reload = Ctrl+R",
    item("reload")?.accelerator === "CmdOrCtrl+R",
    item("reload")?.accelerator,
  );
  check(
    "menu accelerator Fullscreen = F11",
    item("fullscreen")?.accelerator === "F11",
    item("fullscreen")?.accelerator,
  );
  check(
    "menu accelerator DevTools = Ctrl+Shift+I (visible in dev)",
    item("devtools")?.accelerator === "Ctrl+Shift+I" &&
      item("devtools")?.visible === true,
    `${item("devtools")?.accelerator} visible=${item("devtools")?.visible}`,
  );

  // reload action
  let loads = 0;
  page.on("load", () => loads++);
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById("reload").click(),
  );
  await sleep(2500);
  check(
    "Reload action fires (page reloaded)",
    loads >= 1,
    `load events=${loads}`,
  );

  // fullscreen action
  const fsBefore = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isFullScreen(),
  );
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById("fullscreen").click(),
  );
  let fsAfter = fsBefore;
  for (let i = 0; i < 20 && fsAfter === fsBefore; i++) {
    await sleep(250);
    fsAfter = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isFullScreen(),
    );
  }
  check(
    "Fullscreen action fires",
    fsAfter !== fsBefore,
    `${fsBefore} → ${fsAfter}`,
  );
  if (fsAfter !== fsBefore) {
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu().getMenuItemById("fullscreen").click(),
    );
    await sleep(500);
  }

  // devtools action (dev build)
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById("devtools").click(),
  );
  await sleep(600);
  const devOpen = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened(),
  );
  check("DevTools action fires", devOpen === true, `open=${devOpen}`);
  if (devOpen) {
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu().getMenuItemById("devtools").click(),
    );
    await sleep(300);
  }

  // --- 3. tray handled in Phase A (birth-captured stdio); liveness here ---
  const alive = await page
    .evaluate(() => typeof window.zenkai?.isDesktop)
    .catch(() => "dead");
  check(
    "app still alive after menu actions",
    alive === "boolean",
    String(alive),
  );

  await app.close();
  app = undefined;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
