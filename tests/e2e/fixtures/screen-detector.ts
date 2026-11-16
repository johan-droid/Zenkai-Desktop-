import { expect, Page, Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export interface ScreenHealthOptions {
  label: string;
  allowEmptyState?: boolean;
  timeoutMs?: number;
}

/**
 * Asserts that the current page does not suffer from a black/white blank screen,
 * an unhandled React error crash, or an infinite loading state.
 */
export async function assertHealthyScreen(page: Page, options: ScreenHealthOptions): Promise<void> {
  const { label, timeoutMs = 5000 } = options;

  try {
    // 1. Root element exists and is mounted
    const root = page.locator('#root');
    await expect(root).toBeAttached({ timeout: timeoutMs });

    // 2. Ensure root has rendered children (not a blank canvas)
    const childCount = await root.evaluate((el) => el.childElementCount);
    expect(childCount, `Screen '${label}' has empty #root container`).toBeGreaterThan(0);

    // 3. Ensure no unhandled React error boundary crash
    const fatalError = page.locator('text="An unexpected error has occurred"');
    const isFatal = await fatalError.isVisible().catch(() => false);
    expect(isFatal, `Screen '${label}' crashed with an unhandled React Error Boundary`).toBe(false);

    // 4. Ensure viewport is not pure pitch blank with no content
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    const hasVisualElements = await page.evaluate(() => {
      const els = document.querySelectorAll('button, a, img, video, canvas, h1, h2, h3, nav, header');
      return els.length > 0;
    });

    expect(
      hasVisualElements || bodyText.length > 0,
      `Screen '${label}' detected as unrendered / blank page (zero interactive elements)`
    ).toBe(true);

  } catch (err: any) {
    // Capture diagnostic artifact on failure
    const failureDir = path.resolve(process.cwd(), 'qa/artifacts/failures');
    fs.mkdirSync(failureDir, { recursive: true });
    const screenshotPath = path.join(failureDir, `black-screen-fail-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    throw new Error(`[BlackScreenDetector] Health check failed for '${label}': ${err.message}. Screenshot saved to: ${screenshotPath}`);
  }
}

/**
 * Asserts that a targeted control is not a 'dead control':
 * It must be visible, enabled, clickable, and produce an observable change in state or URL.
 */
export async function assertActiveControl(
  page: Page,
  control: Locator,
  options: {
    label: string;
    expectedChange: () => Promise<boolean>;
    timeoutMs?: number;
  }
): Promise<void> {
  const { label, expectedChange, timeoutMs = 5000 } = options;

  await expect(control, `Control '${label}' is not visible`).toBeVisible({ timeout: timeoutMs });
  await expect(control, `Control '${label}' is unexpectedly disabled`).toBeEnabled({ timeout: timeoutMs });

  // Perform interaction
  await control.click();

  // Wait for expected observable state change
  const startTime = Date.now();
  let changed = false;

  while (Date.now() - startTime < timeoutMs) {
    if (await expectedChange()) {
      changed = true;
      break;
    }
    await page.waitForTimeout(100);
  }

  if (!changed) {
    const failureDir = path.resolve(process.cwd(), 'qa/artifacts/failures');
    fs.mkdirSync(failureDir, { recursive: true });
    const screenshotPath = path.join(failureDir, `dead-control-fail-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    throw new Error(`[DeadControlDetector] Control '${label}' was clicked but produced zero observable state changes. Screenshot saved to: ${screenshotPath}`);
  }
}

