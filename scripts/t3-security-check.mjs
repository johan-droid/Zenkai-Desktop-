// T3 acceptance check — run: node scripts/t3-security-check.mjs
// Verifies: (1) non-allowlisted navigation opens externally & not in-app,
// (2) window.open to non-allowlisted URL denied, (3) geolocation denied,
// (4) CSP header present (inline script triggers a policy violation).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const app = await electron.launch({
  executablePath: electronPath,
  args: ["."],
});

let mainLog = "";
app.process().stdout.on("data", (d) => (mainLog += d));
app.process().stderr.on("data", (d) => (mainLog += d));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  const appOrigin = new URL(page.url()).origin;
  console.log(`app loaded: ${page.url()}`);

  // 1. will-navigate: renderer-initiated navigation off-origin must not load in-app
  await page.evaluate(() => {
    location.href = "https://example.com/";
  });
  await page.waitForTimeout(2500);
  const afterNav = new URL(page.url()).origin;
  check(
    "will-navigate blocks in-app load of example.com",
    afterNav === appOrigin,
    `stayed on ${afterNav}`,
  );
  check(
    "will-navigate opened system browser",
    mainLog.includes("[security] opened external: https://example.com"),
    "log line found",
  );

  // 2. setWindowOpenHandler: window.open off-origin → deny (no 2nd window)
  await page.evaluate(() => {
    window.open("https://example.com/");
  });
  await page.waitForTimeout(1500);
  const windowCount = (await app.windows()).length;
  check(
    "window.open off-origin denied",
    windowCount === 1,
    `${windowCount} window(s)`,
  );

  // 3. permission handler: geolocation must be denied (error code 1)
  const geo = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve("timeout"), 8000);
        navigator.geolocation.getCurrentPosition(
          () => {
            clearTimeout(t);
            resolve("granted");
          },
          (e) => {
            clearTimeout(t);
            resolve(`denied:${e.code}`);
          },
        );
      }),
  );
  check("geolocation permission denied", geo === "denied:1", geo);

  // 4. CSP: injected inline script must trigger a securitypolicyviolation
  const csp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve("no-violation"), 4000);
        document.addEventListener(
          "securitypolicyviolation",
          (e) => {
            clearTimeout(t);
            resolve(`violation:${e.violatedDirective}`);
          },
          { once: true },
        );
        const s = document.createElement("script");
        s.textContent = "window.__t3 = 1;";
        document.head.appendChild(s);
      }),
  );
  check("CSP blocks inline script", csp.startsWith("violation:script"), csp);

  // NOTE: no page-content check here — Cloudflare bot-blocks Playwright-automated
  // sessions (body = "Automated Access Denied"). Real render is verified by
  // scripts/t3-plain-load.mjs against plain Electron.
} finally {
  await app.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
