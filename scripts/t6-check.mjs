// T6 acceptance check — run: node scripts/t6-check.mjs
// 1. minimize while (would be) playing → playback:pause received in renderer
// 2. pauseOnClose off → no pause event on minimize
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const executablePath = require("electron");

const userData = path.join(os.homedir(), ".config", "zenkai-desktop");
const settingsPath = path.join(userData, "settings.json");

let original = null;
if (fs.existsSync(settingsPath)) original = fs.readFileSync(settingsPath);
fs.rmSync(settingsPath, { force: true }); // start from defaults (pauseOnClose: true)

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

let app;
try {
  app = await electron.launch({ executablePath, args: ["."] });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });

  await page.evaluate(() => {
    window.__paused = 0;
    window.zenkai.onPlaybackPause(() => {
      window.__paused++;
    });
  });

  // criterion 1: minimize → pause event (pauseOnClose defaults true)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize(),
  );
  await new Promise((r) => setTimeout(r, 1000));
  const p1 = await page.evaluate(() => window.__paused);
  check("minimize → playback:pause received", p1 >= 1, `count=${p1}`);

  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.restore();
    w.show();
  });
  await new Promise((r) => setTimeout(r, 500));

  // criterion 2: setting off → no pause on minimize
  await page.evaluate(() =>
    window.zenkai.settings.set({ pauseOnClose: false }),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize(),
  );
  await new Promise((r) => setTimeout(r, 1000));
  const p2 = await page.evaluate(() => window.__paused);
  check(
    "pauseOnClose off → no pause on minimize",
    p2 === p1,
    `count before=${p1} after=${p2}`,
  );

  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.restore();
    w.show();
  });
  await app.close();
  app = undefined;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  if (original) fs.writeFileSync(settingsPath, original);
  else fs.rmSync(settingsPath, { force: true });
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
