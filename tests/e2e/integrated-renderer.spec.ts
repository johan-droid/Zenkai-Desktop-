import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

test.describe("E2E: Authentic Integrated Website Renderer", () => {
  test("launches Electron with bundled verified React 19 website renderer", async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;
    delete launchEnv.ZENKAI_MODE;

    const app = await electron.launch({
      args: [path.join(__dirname, "../../out/main/index.js")],
      env: launchEnv,
    });

    try {
      const window = await app.firstWindow();
      expect(window).toBeDefined();

      await window.waitForLoadState("domcontentloaded");

      // Verify #root is mounted
      const rootExists = await window.locator("#root").count();
      expect(rootExists).toBe(1);

      // Wait for React to mount the Desktop Navigation Sidebar or Landing/Home view
      const navOrSidebar = window.locator('aside[aria-label="Desktop Navigation"], [data-section]');
      await expect(navOrSidebar.first()).toBeVisible({ timeout: 15000 });

      // Verify theme state in root html tag
      const isDark = await window.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );
      expect(typeof isDark).toBe("boolean");

      // Verify desktop bridge exists on the window
      const isDesktop = await window.evaluate(
        () => (window as any).zenkai?.isDesktop,
      );
      expect(isDesktop).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("navigates to /downloads and renders offline downloads UI", async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;
    delete launchEnv.ZENKAI_MODE;

    const app = await electron.launch({
      args: [path.join(__dirname, "../../out/main/index.js")],
      env: launchEnv,
    });

    try {
      const win = await app.firstWindow();
      expect(win).toBeDefined();

      await win.waitForLoadState("domcontentloaded");

      // Navigate to /home first to enter main app layout with sidebar (supports both HashRouter and BrowserRouter)
      await win.evaluate(() => {
        if (window.location.protocol === "file:") {
          window.location.hash = "#/home";
        } else {
          window.history.pushState({}, "", "/home");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      });

      // Verify the sidebar has the Downloads link (href is #/downloads under HashRouter, /downloads under BrowserRouter)
      const downloadsLink = win.locator('aside[aria-label="Desktop Navigation"] a[href$="/downloads"]');
      await expect(downloadsLink.first()).toBeVisible({ timeout: 15000 });

      // Click downloads link
      await downloadsLink.first().click();

      // Verify the Offline Downloads heading is visible
      const heading = win.locator('h1:has-text("Offline Downloads")');
      await expect(heading).toBeVisible({ timeout: 10000 });
    } finally {
      await app.close();
    }
  });
});

