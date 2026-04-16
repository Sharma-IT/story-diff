import type { Browser, Page } from 'puppeteer';
import { launch } from 'puppeteer';

import type { BrowserConfig } from './story-diff.types.js';

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
] as const;

export async function launchBrowser(config: BrowserConfig = {}): Promise<Browser> {
  const {
    headless = true,
    args = [],
    timeout = 60_000,
    executablePath,
  } = config;

  return launch({
    headless,
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
