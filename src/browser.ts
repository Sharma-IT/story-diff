import type { Browser, Page } from 'puppeteer';
import { launch } from 'puppeteer';

import type { BrowserConfig } from './story-diff.types.js';
import type { Logger } from './logger.js';

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
] as const;

export async function launchBrowser(config: BrowserConfig = {}, logger?: Logger): Promise<Browser> {
  const {
    headless = true,
    args = [],
    timeout = 60_000,
    executablePath,
  } = config;

  logger?.debug(`Launching browser in ${headless ? 'headless' : 'headed'} mode`);
  logger?.debug('Browser args:', [...DEFAULT_ARGS, ...args]);

  return launch({
    headless: headless === false ? false : 'shell', // Use 'shell' for new headless mode
    args: [...DEFAULT_ARGS, ...args],
    timeout,
    ...(executablePath ? { executablePath } : {}),
  });
}

export async function createPage(browser: Browser, width = 1440, height = 900): Promise<Page> {
  const page = await browser.newPage();

  await page.setViewport({ width, height });
  page.setDefaultNavigationTimeout(60_000);
  page.setDefaultTimeout(30_000);

  return page;
}

export async function closeBrowser(browser: Browser): Promise<void> {
  try {
    const pages = await browser.pages().catch(() => null);
    if (pages) {
      await browser.close();
    }
  } catch {
    // Browser already closed
  }
}
