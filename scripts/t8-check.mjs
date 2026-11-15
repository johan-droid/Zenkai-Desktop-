// T8 acceptance check — run: node scripts/t8-check.mjs
// Local HTTP server (Range/206 capable, slow stream):
//   1. Kill mid-download → relaunch → resume completes via Range/206
//   2. 4th download queued until a slot frees (max 3 concurrent)
//   3. filename sanitized live; non-http(s) URL rejected; remove smoke
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

// --- local file server with Range support, slow enough to kill mid-flight ---
const FILE_SIZE = 2 * 1024 * 1024; // 2MB
const CHUNK = 32 * 1024;
const DELAY_MS = 40; // 64 chunks × 40ms ≈ 2.6s per full stream
const files = {
  resume: Buffer.alloc(FILE_SIZE, 0xaa),
  a: Buffer.alloc(FILE_SIZE, 0x01),
  b: Buffer.alloc(FILE_SIZE, 0x02),
  c: Buffer.alloc(FILE_SIZE, 0x03),
  d: Buffer.alloc(FILE_SIZE, 0x04),
};
const rangeHits = {};

const server = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? "/").slice(1));
  const buf = files[name];
  res.on("error", () => {});
  if (!buf) {
    res.writeHead(404);
    res.end();
    return;
  }
  let start = 0;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d+)-$/.exec(range);
    start = m ? Number(m[1]) : 0;
    if (start >= buf.length) {
      res.writeHead(416, { "Content-Range": `bytes */${buf.length}` });
      res.end();
      return;
    }
    rangeHits[name] = (rangeHits[name] ?? 0) + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${buf.length - 1}/${buf.length}`,
      "Content-Length": buf.length - start,
      "Accept-Ranges": "bytes",
    });
  } else {
    res.writeHead(200, {
      "Content-Length": buf.length,
      "Accept-Ranges": "bytes",
    });
  }
  let off = start;
  const timer = setInterval(() => {
    const end = Math.min(off + CHUNK, buf.length);
    res.write(buf.subarray(off, end));
    off = end;
    if (off >= buf.length) {
      clearInterval(timer);
      res.end();
    }
  }, DELAY_MS);
  res.on("close", () => clearInterval(timer));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// --- settings backup/restore + temp download dir ---
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
const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenkai-dl-check-"));

const list = (page) => page.evaluate(() => window.zenkai.downloads.list());
const until = async (fn, what, timeout = 30000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout)
      throw new Error(`timeout waiting for: ${what}`);
    await sleep(150);
  }
};

let app;
try {
  // ============ Phase A: kill mid-download ============
  app = await electron.launch({ executablePath, args: ["."] });
  let page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await page.evaluate(
    (d) => window.zenkai.settings.set({ downloadDir: d }),
    dlDir,
  );
  await page.evaluate(
    (b) =>
      window.zenkai.downloads.start({
        id: "resume",
        url: `${b}/resume`,
        name: "resume.bin",
      }),
    base,
  );

  await until(async () => {
    const it = (await list(page)).find((i) => i.id === "resume");
    return it && it.bytes >= 192 * 1024;
  }, "first download reaches ≥192KB");
  await app.close(); // kill mid-download
  app = undefined;

  const partPath = path.join(dlDir, "resume.bin.part");
  const partSize = fs.statSync(partPath).size;
  check(
    "killed mid-download: .part exists, partial",
    fs.existsSync(partPath) && partSize > 0 && partSize < FILE_SIZE,
    `${partSize}/${FILE_SIZE} bytes`,
  );

  // ============ Phase B: relaunch → resume ============
  app = await electron.launch({ executablePath, args: ["."] });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  const done = await until(async () => {
    const it = (await list(page)).find((i) => i.id === "resume");
    return it && (it.status === "done" || it.status === "error") ? it : null;
  }, "resume completes after relaunch");
  check(
    "relaunch → interrupted download finishes",
    done.status === "done",
    done.status,
  );
  check(
    "resume used Range/206",
    (rangeHits.resume ?? 0) >= 1,
    `range requests=${rangeHits.resume ?? 0}`,
  );
  const finalPath = path.join(dlDir, "resume.bin");
  check(
    "final file complete, .part renamed away",
    fs.existsSync(finalPath) &&
      fs.statSync(finalPath).size === FILE_SIZE &&
      !fs.existsSync(partPath),
    fs.existsSync(finalPath)
      ? `${fs.statSync(finalPath).size} bytes`
      : "missing",
  );

  // ============ Phase C: max 3 concurrent, 4th queued ============
  const evilName = "..\\..\\evil:name?.bin"; // sanitized live
  for (const id of ["a", "b", "c", "d"]) {
    await page.evaluate(
      ({ b, i, n }) =>
        window.zenkai.downloads.start({
          id: i,
          url: `${b}/${i}`,
          name: i === "d" ? n : `${i}.bin`,
        }),
      { b: base, i: id, n: evilName },
    );
  }
  await sleep(1200); // all four started; first three still streaming
  const mid = (await list(page)).filter((i) =>
    ["a", "b", "c", "d"].includes(i.id),
  );
  const active = mid.filter((i) => i.status === "active");
  const queued = mid.filter((i) => i.status === "queued");
  check(
    "max 3 concurrent (4th not active)",
    active.length === 3 && queued.length === 1,
    `active=${active.length} queued=${queued.length} (${mid.map((i) => `${i.id}:${i.status}`).join(" ")})`,
  );

  const all = await until(
    async () => {
      const cur = (await list(page)).filter((i) =>
        ["a", "b", "c", "d"].includes(i.id),
      );
      return cur.every((i) => i.status === "done") ? cur : null;
    },
    "all 4 downloads complete",
    60000,
  );
  check(
    "all 4 complete (queued one ran after slot freed)",
    all.length === 4,
    all.map((i) => `${i.id}:${i.status}:${i.bytes}`).join(" "),
  );

  const dItem = all.find((i) => i.id === "d");
  const clean = !/[\/\\:*?"<>|]/.test(dItem.name) && !dItem.name.includes("..");
  check(
    "live filename sanitized",
    clean && fs.existsSync(path.join(dlDir, dItem.name)),
    dItem.name,
  );

  // ============ Phase D: validation + remove smoke ============
  const rejected = await page.evaluate(() =>
    window.zenkai.downloads
      .start({ id: "x", url: "file:///etc/passwd", name: "x" })
      .then(
        () => "resolved",
        () => "rejected",
      ),
  );
  check("non-http(s) URL rejected at IPC", rejected === "rejected", rejected);

  await page.evaluate(() => window.zenkai.downloads.remove("a"));
  await sleep(300);
  const afterRemove = (await list(page)).find((i) => i.id === "a");
  check(
    "downloads:remove drops entry, keeps completed file",
    !afterRemove && fs.existsSync(path.join(dlDir, "a.bin")),
    afterRemove
      ? `still listed: ${afterRemove.status}`
      : "entry gone, file kept",
  );

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
