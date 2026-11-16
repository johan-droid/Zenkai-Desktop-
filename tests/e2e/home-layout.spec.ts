import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

/**
 * Home layout regression: the first shelf must not be pulled up over the hero.
 * When it was (negative margin), the hero pager dots were covered and both
 * prev/next control pairs overlapped.
 */
test("home hero pager stays visible and shelves start below the hero", async () => {
  const launchEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  delete launchEnv.ZENKAI_WEB_URL;
  delete launchEnv.ZENKAI_MODE;

  const app = await electron.launch({
    args: ["--no-sandbox", path.join(__dirname, "../../out/main/index.js")],
    env: launchEnv,
  });

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState("domcontentloaded");
    await win.setViewportSize({ width: 1440, height: 900 });
    await win.evaluate(() => {
      window.location.hash = "#/home";
      window.scrollTo(0, 0);
    });

    const hero = win.locator('[aria-roledescription="carousel"]').first();
    await expect(hero).toBeVisible({ timeout: 20000 });

    // Onboarding overlays (release notes) can cover the hero on first launch.
    await win.waitForTimeout(1200);
    for (const name of ["Continue", "Got it", "Maybe later"]) {
      const button = win.getByRole("button", { name, exact: true }).first();
      if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
    }
    // Release notes can finish loading after the initial page render.
    await win.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    for (const name of ["Continue", "Got it", "Maybe later", "Close"]) {
      const button = win.getByRole("button", { name, exact: true }).first();
      if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
    }
    await win.waitForTimeout(400);
    await win.evaluate(() => window.scrollTo(0, 0));

    const layout = await win.evaluate(() => {
      const hero = document.querySelector('[aria-roledescription="carousel"]');
      const shelf = document.querySelector("main > div > section");
      const dot = document.querySelector(
        '[role="tablist"][aria-label="Featured anime"] button',
      );
      if (!hero || !shelf || !dot) return null;
      const r = dot.getBoundingClientRect();
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return {
        gap: Math.round(
          shelf.getBoundingClientRect().top -
            hero.getBoundingClientRect().bottom,
        ),
        pagerOnTop: Boolean(top && (top === dot || dot.contains(top))),
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.gap).toBeGreaterThanOrEqual(0);
    expect(layout!.pagerOnTop).toBe(true);
  } finally {
    await app.close();
  }
});
