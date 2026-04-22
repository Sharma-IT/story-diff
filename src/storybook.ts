import type { PageAdapter } from './browser.js';
import type { Logger } from './logger.js';
import { StorybookConnectionError } from './errors.js';

/**
 * Build an iframe URL for a Storybook story.
 *
 * Storybook renders stories inside /iframe.html with query params for the
 * story ID, view mode, and optional globals (theme, locale, etc.).
 */
export function buildStoryUrl(
  storybookUrl: string,
  storyId: string,
  globals?: Readonly<Record<string, string>>,
): string {
  const base = storybookUrl.replace(/\/+$/, '');
  const baseParams = { id: storyId, viewMode: 'story' };

  const globalsParam =
    globals && Object.keys(globals).length > 0
      ? {
          globals: Object.entries(globals)
            .map(([key, value]) => `${key}:${value}`)
            .join(';'),
        }
      : {};

  const params = new URLSearchParams({ ...baseParams, ...globalsParam } as Record<string, string>);

  return `${base}/iframe.html?${params.toString()}`;
}

const STORYBOOK_SELECTORS = [
  '#storybook-preview-iframe',
  '#storybook-preview-wrapper',
  '#storybook-root',
  'div[data-testid="preview-container"]',
] as const;

/**
 * Wait for Storybook to be fully loaded and ready for testing.
 * Navigates to the root URL and waits for known UI elements.
 */
export async function waitForStorybookReady(
  page: PageAdapter,
  storybookUrl: string,
  logger?: Logger,
  timeout = 60_000,
): Promise<void> {
  const base = storybookUrl.replace(/\/+$/, '');

  logger?.debug(`Checking Storybook readiness at: ${base}`);

  const response = await page.goto(base, {
    waitUntil: 'domcontentloaded',
    timeout,
  });

  if (!response) {
    logger?.error('No response from Storybook');
    throw new StorybookConnectionError(base, 'No response');
  }

  if (!response.ok()) {
    logger?.error(`Storybook returned HTTP ${String(response.status())}`);
    throw new StorybookConnectionError(base, `HTTP ${String(response.status())}`);
  }

  // Wait for any known Storybook UI element to appear
  const foundSelector = await (async (): Promise<string | null> => {
    for (const selector of STORYBOOK_SELECTORS) {
      try {
        logger?.debug(`Waiting for Storybook selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 15_000 });
        logger?.debug(`Found Storybook UI element: ${selector}`);
        return selector;
      } catch {
        // Try next selector
      }
    }
    return null;
  })();

  if (!foundSelector) {
    logger?.error('Storybook UI did not load - no expected selectors found');
    throw new StorybookConnectionError(
      base,
      'Storybook UI did not load. None of the expected selectors were found.',
    );
  }

  logger?.info('Storybook is ready');
}
