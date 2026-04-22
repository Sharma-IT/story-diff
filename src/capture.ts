import type { ElementHandleAdapter, PageAdapter } from './browser.js';
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
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 3_000;

async function findStoryRoot(page: PageAdapter): Promise<ElementHandleAdapter | null> {
  for (const selector of STORY_ROOT_SELECTORS) {
    const element = await page.query(selector);
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
  page: PageAdapter,
  storybookUrl: string,
  storyId: string,
  options: CaptureOptions = {},
  logger?: Logger,
): Promise<Buffer> {
  const { 
    globals, 
    waitForSelector, 
    waitForTimeout = DEFAULT_WAIT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
  } = options;

  const url = buildStoryUrl(storybookUrl, storyId, globals);
  logger?.debug(`Navigating to: ${url}`);

  const runAttempt = async (attempt: number): Promise<{ readonly type: 'success'; readonly data: Buffer } | { readonly type: 'failure'; readonly error: Error }> => {
    try {
      if (attempt > 0) {
        logger?.warn(`Retry attempt ${String(attempt)} for story: ${storyId}`);
      }

      const response = await page.goto(url, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT,
      });

      if (!response?.ok()) {
        return {
          type: 'failure',
          error: new Error(`Navigation failed: HTTP ${String(response?.status() ?? 'no response')} for ${url}`)
        };
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
        logger?.debug(`Waiting ${String(waitForTimeout)}ms for render to settle`);
      }
      await delay(waitForTimeout);

      // Find the story root element
      const element = await findStoryRoot(page);

      if (!element) {
        return {
          type: 'failure',
          error: new Error(`Could not find story root element for ${storyId}. Tried selectors: ${STORY_ROOT_SELECTORS.join(', ')}`)
        };
      }

      await element.evaluate((el: unknown) => {
        if (el instanceof HTMLElement) {
          // eslint-disable-next-line functional/immutable-data
          el.style.display = 'inline-block';
        }
      });

      const box = await element.boundingBox();
      if (!box || box.height === 0) {
        await page.screenshot({ path: `e2e/snapshots/error-${storyId}-zero-height.png` }).catch(() => undefined);
        return {
          type: 'failure',
          error: new Error(`Story element has zero height for ${storyId}`)
        };
      }

      logger?.debug(`Captured screenshot: ${String(box.width)}x${String(box.height)}px`);
      const screenshotData = await element.screenshot({ type: 'png', omitBackground: true });
      return {
        type: 'success',
        data: Buffer.isBuffer(screenshotData) ? screenshotData : Buffer.from(screenshotData)
      };
    } catch (error) {
      return {
        type: 'failure',
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  const attempts = Array.from({ length: maxRetries + 1 }, (_, i) => i);
  
  // We use a for-of loop to execute attempts sequentially with await
  // This is a common pattern for retries even in functional code.
  // eslint-disable-next-line functional/no-let
  let lastError: Error | undefined;

  for (const attempt of attempts) {
    const result = await runAttempt(attempt);
    if (result.type === 'success') {
      return result.data;
    }
    
    lastError = result.error;
    if (attempt < maxRetries) {
      logger?.warn(`Capture failed, retrying in ${String(retryDelay)}ms...`, result.error.message);
      await delay(retryDelay);
    }
  }

  logger?.error(`Failed to capture story after ${String(maxRetries + 1)} attempts:`, lastError?.message);
  throw lastError ?? new Error(`Failed to capture story ${storyId}`);
}


