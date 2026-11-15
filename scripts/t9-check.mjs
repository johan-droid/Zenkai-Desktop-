// T9 acceptance check — run: node scripts/t9-check.mjs
// A. No ZENKAI_DISCORD_APP_ID → RPC disabled, logged exactly once, calls resolve
// B. Fake app ID, Discord closed → no crash, no uncaught error, retry logged
// C. rpc:clear resolves; invalid payload rejected
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
const count = (hay, re) => (hay.match(re) ?? []).length;

async function launch(extraEnv) {
  const app = await electron.launch({
    executablePath,
    args: ["."],
    env: { ...process.env, ...extraEnv },
  });
  let log = "";
  app.process().stdout.on("data", (d) => (log += d));
  app.process().stderr.on("data", (d) => (log += d));
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  return { app, page, logRef: () => log };
}

// run a bridge call and report resolved/rejected without throwing
const bridge = (page, methodPath, args) =>
  page.evaluate(
    ([p, a]) => {
      const fn = p.split(".").reduce((o, k) => o[k], window.zenkai);
      return fn(...a).then(
        () => "resolved",
        (err) => "rejected:" + String(err).slice(0, 80),
      );
    },
    [methodPath, args],
  );

let appA;
let appB;
try {
  // ============ A: no app id → disabled, log once ============
  const envA = { ...process.env };
  delete envA.ZENKAI_DISCORD_APP_ID;
  const A = await launch(envA);
  appA = A.app;

  const r1 = await bridge(A.page, "rpc.set", [{ title: "Watching Zenkai" }]);
  const r2 = await bridge(A.page, "rpc.set", [
    { title: "Still watching", details: "S1E2" },
  ]);
  check(
    "rpc:set resolves when ID missing (fails silently)",
    r1 === "resolved" && r2 === "resolved",
    `${r1} / ${r2}`,
  );

  await sleep(500);
  const disabled = count(A.logRef(), /Rich Presence disabled/g);
  check(
    "disabled message logged exactly once (not per call)",
    disabled === 1,
    `occurrences=${disabled}`,
  );

  const alive = await A.page
    .evaluate(() => typeof window.zenkai?.isDesktop)
    .catch(() => "dead");
  check("app alive after disabled-RPC calls", alive === "boolean", alive);
  await appA.close();
  appA = undefined;

  // ============ B: fake id, Discord closed → no crash ============
  const B = await launch({
    ZENKAI_DISCORD_APP_ID: "123456789012345678",
    ZENKAI_RPC_MAX_RETRIES: "2",
  });
  appB = B.app;

  const r3 = await bridge(B.page, "rpc.set", [
    { title: "Watching Zenkai", startedAt: 1700000000000 },
  ]);
  check("rpc:set resolves with app id set", r3 === "resolved", r3);

  // wait for first connect outcome (Discord absent → retry warn; present → connected)
  let outcome = "";
  for (let i = 0; i < 40 && !outcome; i++) {
    await sleep(250);
    if (/Discord unavailable/.test(B.logRef())) outcome = "retry-logged";
    else if (/\[rpc\] connected to Discord/.test(B.logRef()))
      outcome = "connected";
  }
  check(
    "connection outcome handled (retry logged or connected)",
    outcome !== "",
    outcome || `no rpc log yet: ${B.logRef().slice(0, 200)}`,
  );

  await sleep(4500); // past first retry window start; app must survive
  const aliveB = await B.page
    .evaluate(() => typeof window.zenkai?.isDesktop)
    .catch(() => "dead");
  const uncaught =
    /uncaught|unhandledrejection|UnhandledPromiseRejection/i.test(B.logRef());
  check(
    "no crash / no uncaught error (Discord closed)",
    aliveB === "boolean" && !uncaught,
    `alive=${aliveB} uncaught=${uncaught}`,
  );

  const r4 = await bridge(B.page, "rpc.clear", []);
  check("rpc:clear resolves", r4 === "resolved", r4);

  const r5 = await bridge(B.page, "rpc.set", [{ title: "" }]);
  check(
    "invalid rpc:set payload rejected",
    r5.startsWith("rejected:"),
    r5.slice(0, 70),
  );

  await appB.close();
  appB = undefined;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  if (appA) await appA.close().catch(() => {});
  if (appB) await appB.close().catch(() => {});
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((r) => !r)) process.exitCode = 1;
