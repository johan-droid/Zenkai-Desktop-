// T4 acceptance check — run: node scripts/t4-bridge-check.mjs
// Verifies via raw CDP (plain Electron, no Playwright):
//   1. window.zenkai.isDesktop === true
//   2. window.require and window.process undefined in renderer
//   3. IPC round trip: window.zenkai.app.version() → package version
//   4. bridge exposes only the contract surface
import { spawn } from "node:child_process";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

const procEnv = { ...process.env };
delete procEnv.ELECTRON_RUN_AS_NODE;

const proc = spawn(
  "node_modules/electron/dist/electron",
  [".", "--no-sandbox", "--remote-debugging-port=9335", "--user-data-dir=/tmp/zenkai-t4-profile"],
  {
    stdio: ["ignore", "ignore", "inherit"],
    env: procEnv,
  },
);

try {
  await sleep(8000);
  const targets = await (await fetch("http://127.0.0.1:9335/json/list")).json();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("ws error")), {
      once: true,
    });
  });

  let nextId = 1;
  const cdp = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== id) return;
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result.result.value);
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await sleep(4000);

  const snap = JSON.parse(
    await cdp("Runtime.evaluate", {
      expression:
        "JSON.stringify({ isDesktop: window.zenkai ? window.zenkai.isDesktop : null, require: typeof window.require, process: typeof window.process, keys: Object.keys(window.zenkai ?? {}).sort() })",
      returnByValue: true,
    }),
  );

  check(
    "window.zenkai.isDesktop === true",
    snap.isDesktop === true,
    String(snap.isDesktop),
  );
  check("window.require undefined", snap.require === "undefined", snap.require);
  check("window.process undefined", snap.process === "undefined", snap.process);

  // exact surface = preload object keys (contract single source)
  check(
    "bridge surface matches preload contract",
    JSON.stringify(snap.keys) ===
      JSON.stringify([
        "app",
        "downloads",
        "isDesktop",
        "onAuthCallback",
        "onNotifyClick",
        "onPlaybackPause",
        "platform",
        "rpc",
        "settings",
        "vision",
      ]),
    snap.keys.join(","),
  );

  const hardwareProfile = JSON.parse(
    await cdp("Runtime.evaluate", {
      expression: "window.zenkai.vision.getHardwareProfile().then(p => JSON.stringify(p))",
      awaitPromise: true,
      returnByValue: true,
    }),
  );
  check(
    "IPC round trip vision.getHardwareProfile()",
    hardwareProfile && Array.isArray(hardwareProfile.devices) && Boolean(hardwareProfile.profile),
    `devices=${hardwareProfile?.devices?.length}, profile=${hardwareProfile?.profile?.profile}`,
  );

  const models = JSON.parse(
    await cdp("Runtime.evaluate", {
      expression: "window.zenkai.vision.getModels().then(m => JSON.stringify(m))",
      awaitPromise: true,
      returnByValue: true,
    }),
  );
  check(
    "IPC round trip vision.getModels()",
    Array.isArray(models) && models.length >= 4,
    `modelsCount=${models?.length}`,
  );

  const jobs = JSON.parse(
    await cdp("Runtime.evaluate", {
      expression: "window.zenkai.vision.getJobs().then(j => JSON.stringify(j))",
      awaitPromise: true,
      returnByValue: true,
    }),
  );
  check(
    "IPC round trip vision.getJobs()",
    Array.isArray(jobs),
    `jobsCount=${jobs?.length}`,
  );

  const version = await cdp("Runtime.evaluate", {
    expression: "window.zenkai.app.version()",
    awaitPromise: true,
    returnByValue: true,
  });
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  check("IPC round trip app.version()", version === pkg.version, version);

  ws.close();
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  proc.kill("SIGTERM");
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
