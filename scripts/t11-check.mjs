// T11 acceptance check — run: node scripts/t11-check.mjs
// 1. Second instance launched with zenkai://test   → focuses existing window, quits
// 2. Second instance with zenkai://auth?token=…    → auth:callback delivered with token
// 3. Grep main log: the token NEVER appears (redaction)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
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

const TOKEN = "SUPERSECRET123XYZ";
const isFocused = (app) =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFocused() ?? false,
  );
const blur = (app) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.blur());

async function launchSecond(argvLink) {
  const p = spawn(executablePath, [".", argvLink], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  const exited = await Promise.race([
    new Promise((r) => p.on("exit", (code) => r({ exited: true, code }))),
    sleep(10000).then(() => ({ exited: false, code: null })),
  ]);
  return { ...exited, out };
}

const waitFocused = async (app) => {
  for (let i = 0; i < 20; i++) {
    if (await isFocused(app)) return true;
    await sleep(150);
  }
  return false;
};

const closeApp = async (a) => {
  if (!a) return;
  await Promise.race([
    a.close().catch(() => {}),
    sleep(8000).then(() => a.process().kill("SIGKILL")), // never hang the check
  ]);
};

let app;
try {
  app = await electron.launch({ executablePath, args: ["."] });
  let log = "";
  app.process().stdout.on("data", (d) => (log += d));
  app.process().stderr.on("data", (d) => (log += d));

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await sleep(1500);

  await page.evaluate(() => {
    window.__auth = null;
    window.zenkai.onAuthCallback((p) => (window.__auth = p));
  });

  // --- 1. zenkai://test → focus existing window, second instance exits ---
  await blur(app);
  await sleep(300);
  const beforeFocus = await isFocused(app);
  const t1 = await launchSecond("zenkai://test");
  const focused1 = await waitFocused(app);
  const link1Log = /\[protocol\] deep link received \(no token\)/.test(log);
  check(
    "zenkai://test while running → existing window focused",
    focused1 && link1Log,
    `wasFocused=${beforeFocus} focusedAfter=${focused1} linkLog=${link1Log}`,
  );
  check(
    "second instance exited (single-instance lock)",
    t1.exited,
    `code=${t1.code}`,
  );

  // --- 2. zenkai://auth?token=… → auth:callback with token ---
  const t2 = await launchSecond(`zenkai://auth?token=${TOKEN}`);
  let auth = null;
  for (let i = 0; i < 20 && !auth; i++) {
    auth = await page.evaluate(() => window.__auth);
    if (!auth) await sleep(150);
  }
  check(
    "auth link → auth:callback delivered to renderer",
    auth?.token === TOKEN,
    auth
      ? `token=${auth.token === TOKEN ? "<matches>" : "<mismatch>"}`
      : "no event",
  );
  const focused2 = await waitFocused(app);
  check("auth link also focuses window", focused2, `focused=${focused2}`);
  check(
    "auth-link second instance exited (single-instance lock)",
    t2.exited,
    `code=${t2.code}`,
  );

  // --- 3. token never in logs ---
  await sleep(500);
  const leaked = log.includes(TOKEN);
  const redacted = /\[protocol\] auth link received \(token redacted\)/.test(
    log,
  );
  check(
    "token never logged (grep full main log)",
    !leaked,
    leaked ? "LEAKED" : "absent",
  );
  check("redacted-auth log line present", redacted);

  await closeApp(app);
  app = undefined;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await closeApp(app);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
