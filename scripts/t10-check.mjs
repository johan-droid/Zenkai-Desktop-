// T10 acceptance check — run: node scripts/t10-check.mjs
// Main-side notification trigger: download completion → showNotification.
// Verifies: notification shown (or graceful libnotify no-op), app alive.
// (Click → focus + notify:click payload is covered by tests/unit/notify.test.ts —
//  OS notification clicks are not scriptable from the harness.)
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const executablePath = require("electron");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

const payload = Buffer.alloc(64 * 1024, 0x77);
const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Length": payload.length,
    "Accept-Ranges": "bytes",
  });
  res.end(payload);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const settingsPath = path.join(
  os.homedir(),
  ".config",
  "zenkai-desktop",
  "settings.json",
);
let originalSettings = null;
if (fs.existsSync(settingsPath))
  originalSettings = fs.readFileSync(settingsPath);
fs.rmSync(settingsPath, { force: true });
const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenkai-notify-check-"));

let app;
try {
  app = await electron.launch({ executablePath, args: ["."] });
  let log = "";
  app.process().stdout.on("data", (d) => (log += d));
  app.process().stderr.on("data", (d) => (log += d));

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await page.evaluate(
    (d) => window.zenkai.settings.set({ downloadDir: d }),
    dlDir,
  );

  // trigger: real download completion fires showNotification from main
  await page.evaluate(
    (b) =>
      window.zenkai.downloads.start({
        id: "n",
        url: `${b}/n.bin`,
        name: "notify-me.bin",
      }),
    base,
  );

  let status = "";
  for (let i = 0; i < 80 && status !== "done"; i++) {
    await sleep(250);
    const it = await page.evaluate(() =>
      window.zenkai.downloads.list().then((l) => l.find((x) => x.id === "n")),
    );
    status = it?.status ?? "";
    if (status === "error") break;
  }
  check("trigger download completes", status === "done", status);

  await sleep(800); // notification fires right after done
  const shown = /\[notify\] shown: n/.test(log);
  const skipped = /\[notify\] notifications unsupported/.test(log);
  check(
    "notification shown OR graceful libnotify no-op",
    shown || skipped,
    shown
      ? "shown"
      : skipped
        ? "unsupported → skipped (logged)"
        : `no notify log: ${log.slice(0, 300)}`,
  );

  const alive = await page
    .evaluate(() => typeof window.zenkai?.isDesktop)
    .catch(() => "dead");
  check("app alive after notification path", alive === "boolean", alive);

  await app.close();
  app = undefined;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  server.close();
  if (originalSettings) fs.writeFileSync(settingsPath, originalSettings);
  else fs.rmSync(settingsPath, { force: true });
  fs.rmSync(dlDir, { recursive: true, force: true });
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
