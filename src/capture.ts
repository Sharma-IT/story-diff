import type { Page } from 'puppeteer';

import type { CaptureOptions } from './story-diff.types.js';
import type { Logger } from './logger.js';
import { buildStoryUrl } from './storybook.js';

const STORY_ROOT_SELECTORS = [
  // Primary target for Storybook v7+: Selects the inner component to bypass root wrapper padding or backgrounds.
  '#storybook-root > :first-child',
  // Primary target for Storybook v6: Selects the inner component to bypass root wrapper padding or backgrounds.
  '#root > :first-child',
  // Fallback for Storybook v7+: Safely catches cases where the component has no children or renders direct text.
  '#storybook-root',
  // Fallback for Storybook v6: Safely catches cases where the component has no children or renders direct text.
  '#root',
] as const;

const DEFAULT_WAIT_TIMEOUT = 0; // No implicit wait - components must be ready or use waitForSelector
const NAVIGATION_TIMEOUT = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 3_000;

async function findStoryRoot(page: Page): Promise<ReturnType<Page['$']>> {
  for (const selector of STORY_ROOT_SELECTORS) {
    const element = await page.$(selector);
    if (element) {
      const box = await element.boundingBox();
      if (box && box.height > 0 && box.width > 0) {
        return element;
      }
    }
  }
  return null;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function captureStory(
  page: Page,
  storybookUrl: string,
  storyId: string,
  options: CaptureOptions = {},
  logger?: Logger,
): Promise<Buffer> {
  const { globals, waitForSelector, waitForTimeout = DEFAULT_WAIT_TIMEOUT } = options;

  const url = buildStoryUrl(storybookUrl, storyId, globals);
  logger?.debug(`Navigating to: ${url}`);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        logger?.warn(`Retry attempt ${attempt} for story: ${storyId}`);
      }

      const response = await page.goto(url, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT,
      });

      if (!response || !response.ok()) {
        throw new Error(
          `Navigation failed: HTTP ${response?.status() ?? 'no response'} for ${url}`,
        );
      }

      // Wait for page readiness
      await page
        .waitForFunction('document.readyState === "complete"', { timeout: 30_000 })
        .catch(() => undefined);

      // Defensively wait for at least one child element inside the most common root
      await page.waitForSelector('#storybook-root > *', { timeout: 5000 }).catch(() => undefined);

      // Wait for custom selector if provided
      if (waitForSelector) {
        logger?.debug(`Waiting for selector: ${waitForSelector}`);
        await page.waitForSelector(waitForSelector, { timeout: 30_000 });
      }

      // Allow render to settle
      if (waitForTimeout > 0) {
        logger?.debug(`Waiting ${waitForTimeout}ms for render to settle`);
      }
      await delay(waitForTimeout);

      // Find the story root element
      const element = await findStoryRoot(page);

      if (!element) {
        throw new Error(
          `Could not find story root element for ${storyId}. Tried selectors: ${STORY_ROOT_SELECTORS.join(', ')}`,
        );
      }

      await element.evaluate((el: any) => {
        if (el && el.style) {
          el.style.display = 'inline-block';
        }
      });

      const box = await element.boundingBox();
      if (!box || box.height === 0) {
        await page.screenshot({ path: `e2e/snapshots/error-${storyId}-zero-height.png` }).catch(() => {});
        throw new Error(`Story element has zero height for ${storyId}`);
      }

      logger?.debug(`Captured screenshot: ${box.width}x${box.height}px`);
      const screenshotData = await element.screenshot({ type: 'png', omitBackground: true });
      return Buffer.isBuffer(screenshotData)
        ? screenshotData
        : Buffer.from(screenshotData);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        logger?.warn(`Capture failed, retrying in ${RETRY_DELAY}ms...`, lastError.message);
        await delay(RETRY_DELAY);
      }
    }
  }

  logger?.error(`Failed to capture story after ${MAX_RETRIES + 1} attempts:`, lastError?.message);
  throw lastError ?? new Error(`Failed to capture story ${storyId}`);
}
