import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';
import { assertHealthyScreen, assertActiveControl } from './fixtures/screen-detector';

test.describe('Zenkai Desktop: Full QA Automated Workflows & Release Gates', () => {
  let app: any;
  let win: any;

  test.beforeAll(async () => {
    const launchEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    delete launchEnv.ZENKAI_WEB_URL;
    delete launchEnv.ZENKAI_MODE;

    app = await electron.launch({
      args: ['--no-sandbox', '--ozone-platform=x11', path.join(__dirname, '../../out/main/index.js')],
      env: launchEnv,
    });

    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.setViewportSize({ width: 1440, height: 900 });

    // Dismiss any initial onboarding modal if present
    await win.waitForTimeout(1000);
    for (const name of ['Continue', 'Got it', 'Maybe later', 'Close']) {
      const btn = win.getByRole('button', { name, exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
      }
    }
  });

  test.afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  test('WORKFLOW-01: App Startup & Window Integrity (GATE-BOOT)', async () => {
    await assertHealthyScreen(win, { label: 'Initial Startup Screen' });

    // Verify Electron preload bridge
    const isDesktop = await win.evaluate(() => (window as any).zenkai?.isDesktop);
    expect(isDesktop, 'Preload bridge window.zenkai.isDesktop must be true').toBe(true);

    const version = await win.evaluate(async () => await (window as any).zenkai?.app?.version?.());
    expect(typeof version).toBe('string');
  });

  test('WORKFLOW-02: Section Navigation & Sidebar Reactivity (GATE-NAV & GATE-HUB)', async () => {
    // Navigate to Landing Hub
    await win.evaluate(() => { window.location.hash = '#/'; });
    await assertHealthyScreen(win, { label: 'Landing Hub' });

    // Navigate to Anime Home
    await win.evaluate(() => { window.location.hash = '#/home'; });
    await assertHealthyScreen(win, { label: 'Anime Home' });

    // Test Sidebar Collapse/Expand Toggle
    const collapseBtn = win.locator('button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]').first();
    if (await collapseBtn.isVisible()) {
      await assertActiveControl(win, collapseBtn, {
        label: 'Sidebar Collapse Toggle',
        expectedChange: async () => {
          const isCollapsed = await win.evaluate(() => localStorage.getItem('zk_sidebar_collapsed'));
          return isCollapsed !== null;
        },
      });
    }
  });

  test('WORKFLOW-03: Search Modal & Live Autocomplete (GATE-SEARCH)', async () => {
    await win.evaluate(() => { window.location.hash = '#/home'; });
    await win.waitForTimeout(400);

    // Trigger search via keyboard shortcut Ctrl+K or search bar
    await win.keyboard.press('Control+k');
    await win.waitForTimeout(400);

    // Verify search modal appears
    const searchModal = win.locator('dialog, [role="dialog"], input[placeholder*="Search"]').first();
    await expect(searchModal).toBeVisible({ timeout: 5000 });

    // Fill query
    const searchInput = win.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Demon');
      await win.waitForTimeout(800);
    }

    // Close search modal
    await win.keyboard.press('Escape');
  });

  test('WORKFLOW-04: Anime Catalog & Details View (GATE-ANIME)', async () => {
    await win.evaluate(() => { window.location.hash = '#/browse'; });
    await assertHealthyScreen(win, { label: 'Browse Catalog' });

    // Verify Catalog heading and genre selectors render
    const browseHeading = win.locator('h1:has-text("Browse")').first();
    await expect(browseHeading).toBeVisible({ timeout: 5000 });

    const genreFilter = win.locator('button:has-text("Genre"), [role="combobox"]').first();
    await expect(genreFilter).toBeVisible({ timeout: 5000 });
  });

  test('WORKFLOW-05: Desktop Settings & Multi-GPU Routing (GATE-SETTINGS & GATE-GPU)', async () => {
    await win.evaluate(() => { window.location.hash = '#/settings'; });
    await assertHealthyScreen(win, { label: 'Desktop Settings' });

    // Verify Native Desktop Integrations header
    const settingsHeading = win.locator('h2:has-text("Native Desktop Integrations")').first();
    await expect(settingsHeading).toBeVisible({ timeout: 5000 });

    // Test High Perf button toggle
    const highPerfBtn = win.locator('button:has-text("High Perf")').first();
    if (await highPerfBtn.isVisible()) {
      await highPerfBtn.click();
      await win.waitForTimeout(600);
      const isHighPerf = await highPerfBtn.evaluate((el: HTMLElement) =>
        el.classList.contains('bg-foreground') || el.classList.contains('text-background')
      );
      expect(isHighPerf).toBe(true);
    }

    // Test Run Diagnostics Probe button
    const probeBtn = win.locator('button:has-text("Run Diagnostics")').first();
    if (await probeBtn.isVisible()) {
      await probeBtn.click();
      await win.waitForTimeout(500);
    }
  });

  test('WORKFLOW-06: Offline Downloads Dashboard (GATE-DOWNLOAD)', async () => {
    await win.evaluate(() => { window.location.hash = '#/downloads'; });
    await assertHealthyScreen(win, { label: 'Offline Downloads' });

    // Verify filter buttons exist
    const allFilter = win.locator('button:has-text("All")').first();
    const completedFilter = win.locator('button:has-text("Completed")').first();
    await expect(allFilter).toBeVisible();
    await expect(completedFilter).toBeVisible();
  });

  test('WORKFLOW-07: Ascension Gamification System (GATE-ASCEND)', async () => {
    await win.evaluate(() => { window.location.hash = '#/ascension'; });
    await assertHealthyScreen(win, { label: 'Ascension Hunter System' });

    const ascensionHeading = win.locator('h1:has-text("ZENKAI ASCENSION")').first();
    await expect(ascensionHeading).toBeVisible({ timeout: 5000 });

    const ladderTab = win.locator('button:has-text("Hunter Rank Ladder")').first();
    await expect(ladderTab).toBeVisible({ timeout: 5000 });
  });

  test('WORKFLOW-08: Manga & Novel Hubs (GATE-MANGA & GATE-NOVEL)', async () => {
    // Manga Hub
    await win.evaluate(() => { window.location.hash = '#/manga'; });
    await assertHealthyScreen(win, { label: 'Manga Hub' });

    // Novel Hub
    await win.evaluate(() => { window.location.hash = '#/novel'; });
    await assertHealthyScreen(win, { label: 'Novel Hub' });
  });

  test('WORKFLOW-09: Vision Studio AI Manifests (GATE-VISION)', async () => {
    await win.evaluate(() => { window.location.hash = '#/vision'; });
    await assertHealthyScreen(win, { label: 'Vision Studio' });

    // A late first-session promo can open while the workflow is running.
    // Dismiss transient dialogs before interacting with the page controls.
    await win.keyboard.press('Escape');
    await win.waitForTimeout(200);
    for (const name of ['Maybe later', 'Close', 'Continue', 'Got it']) {
      const dismiss = win.getByRole('button', { name, exact: true }).first();
      if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click().catch(() => {});
        await win.waitForTimeout(200);
      }
    }

    const modelsTab = win.locator('button:has-text("AI Models")').first();
    if (await modelsTab.isVisible()) {
      await modelsTab.click();
      await win.waitForTimeout(400);
      const manifestHeading = win.locator('text="Registered Model Manifests"').first();
      await expect(manifestHeading).toBeVisible({ timeout: 5000 });
    }
  });

  test('WORKFLOW-10: Schedule Calendar & Airings (GATE-NAV)', async () => {
    await win.evaluate(() => { window.location.hash = '#/schedule'; });
    await assertHealthyScreen(win, { label: 'Release Schedule' });

    const scheduleHeading = win.locator('h1:has-text("Schedule")').first();
    await expect(scheduleHeading).toBeVisible({ timeout: 5000 });
  });
});
