// T5 acceptance check — run: node scripts/t5-check.mjs
// 1. settings IPC round trip + partial patch merge (no default leak)
// 2. invalid payload to settings:set → rejected (no crash)
// 3. window state saved on close, restored on relaunch
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const executablePath = require("electron");

const userData = path.join(os.homedir(), ".config", "zenkai-desktop");
const settingsPath = path.join(userData, "settings.json");

// clean slate (preserve any real user settings for restore)
let original = null;
if (fs.existsSync(settingsPath)) original = fs.readFileSync(settingsPath);
fs.rmSync(settingsPath, { force: true });
fs.rmSync(`${settingsPath}.bak`, { force: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

let app;
try {
  // --- launch 1: IPC round trip ---
  app = await electron.launch({ executablePath, args: ["."] });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });

  const set1 = await page.evaluate(() =>
    window.zenkai.settings.set({ pauseOnClose: false, theme: "dark" }),
  );
  check(
    "settings:set returns merged settings",
    set1.pauseOnClose === false && set1.theme === "dark",
    `pauseOnClose=${set1.pauseOnClose} theme=${set1.theme}`,
  );

  const get1 = await page.evaluate(() => window.zenkai.settings.get());
  check(
    "settings:get reflects set",
    get1.theme === "dark" && get1.pauseOnClose === false,
  );

  const set2 = await page.evaluate(() => window.zenkai.settings.set({}));
  check(
    "empty patch does not leak defaults (persists theme)",
    set2.theme === "dark" && set2.pauseOnClose === false,
    `theme=${set2.theme} pauseOnClose=${set2.pauseOnClose}`,
  );

  const bad = await page.evaluate(() =>
    window.zenkai.settings.set({ theme: "neon" }).then(
      () => "resolved",
      (e) => `rejected:${String(e).slice(0, 60)}`,
    ),
  );
  check(
    "invalid payload rejected (not crash)",
    bad.startsWith("rejected:"),
    bad,
  );

  // resize real window → close handler persists these bounds
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({
      x: 300,
      y: 200,
      width: 1111,
      height: 700,
    });
  });
  await new Promise((r) => setTimeout(r, 500));
  await app.close();

  const persisted = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  check(
    "window state persisted on close",
    persisted.windowState?.width === 1111 &&
      persisted.windowState?.height === 700,
    JSON.stringify(persisted.windowState),
  );

  // --- launch 2: restore ---
  app = await electron.launch({ executablePath, args: ["."] });
  const bounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getBounds(),
  );
  check(
    "window state restored on launch",
    bounds.width === 1111 &&
      bounds.height === 700 &&
      bounds.x === 300 &&
      bounds.y === 200,
    JSON.stringify(bounds),
  );
  await app.close();
  app = undefined;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  // restore original settings
  if (original) fs.writeFileSync(settingsPath, original);
  else {
    fs.rmSync(settingsPath, { force: true });
    fs.rmSync(`${settingsPath}.bak`, { force: true });
  }
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
