import { _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainPath = path.join(__dirname, "../out/main/index.js");
const outDir = path.join(__dirname, "../docs/screenshots");
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log("[screenshots] Launching actual Zenkai Desktop application...");
  
  const launchEnv = { ...process.env };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  delete launchEnv.ZENKAI_WEB_URL;
  delete launchEnv.ZENKAI_MODE;

  const app = await electron.launch({
    args: [mainPath, "--user-data-dir=/tmp/zenkai-screenshot-profile"],
    env: launchEnv,
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.setViewportSize({ width: 1280, height: 800 });

    console.log("[screenshots] Waiting for UI to mount...");
    await window.waitForSelector('aside[aria-label="Desktop Navigation"], #root', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2000));

    // 1. Home / Discover Screen
    console.log("[screenshots] Capturing 01-home.png...");
    await window.evaluate(() => { window.location.hash = '#/home'; });
    await new Promise((r) => setTimeout(r, 2500));
    await window.screenshot({ path: path.join(outDir, "01-home.png") });

    // 2. Catalog / Browse Screen
    console.log("[screenshots] Capturing 02-browse.png...");
    await window.evaluate(() => { window.location.hash = '#/browse'; });
    await new Promise((r) => setTimeout(r, 2500));
    await window.screenshot({ path: path.join(outDir, "02-browse.png") });

    // 3. Anime Details Screen (One Piece, ID 21)
    console.log("[screenshots] Capturing 03-details.png...");
    await window.evaluate(() => { window.location.hash = '#/details/21'; });
    await new Promise((r) => setTimeout(r, 2500));
    await window.screenshot({ path: path.join(outDir, "03-details.png") });

    // 4. Desktop Settings & Updates Panel
    console.log("[screenshots] Capturing 04-desktop-settings.png...");
    await window.evaluate(() => { window.location.hash = '#/profile'; });
    await new Promise((r) => setTimeout(r, 2500));
    await window.screenshot({ path: path.join(outDir, "04-desktop-settings.png") });

    // 5. Manga Browse Screen
    console.log("[screenshots] Capturing 05-manga.png...");
    await window.evaluate(() => { window.location.hash = '#/manga'; });
    await new Promise((r) => setTimeout(r, 2500));
    await window.screenshot({ path: path.join(outDir, "05-manga.png") });

    // 6. Movies & TV Screen
    console.log("[screenshots] Capturing 06-movies.png...");
    await window.evaluate(() => { window.location.hash = '#/movies'; });
    await new Promise((r) => setTimeout(r, 2500));
    await window.screenshot({ path: path.join(outDir, "06-movies.png") });

    console.log("[screenshots] Successfully captured all real application screenshots!");
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error("[screenshots] Error capturing screenshots:", err);
  process.exit(1);
});
