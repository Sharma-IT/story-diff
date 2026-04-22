import type {
  Browser as PlaywrightBrowser,
  Locator as PlaywrightLocator,
  Page as PlaywrightPage,
} from 'playwright';
import type {
  Browser as PuppeteerBrowser,
  ElementHandle as PuppeteerElementHandle,
  Page as PuppeteerPage,
} from 'puppeteer';
import { launch as launchPuppeteer } from 'puppeteer';

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

type LaunchWaitUntil = 'load' | 'domcontentloaded';

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

interface WaitForOptions {
  readonly timeout: number;
}

interface GotoOptions {
  readonly waitUntil: LaunchWaitUntil;
  readonly timeout: number;
}

interface ScreenshotOptions {
  readonly path?: string;
  readonly type?: 'png';
  readonly omitBackground?: boolean;
}

interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BrowserResponse {
  ok(): boolean;
  status(): number;
}

export interface ElementHandleAdapter {
  boundingBox(): Promise<BoundingBox | null>;
  evaluate<R>(pageFunction: (element: unknown) => R | Promise<R>): Promise<R>;
  screenshot(options: ScreenshotOptions): Promise<Buffer>;
  getUnderlyingObject(): unknown;
}

export interface PageAdapter {
  setViewport(viewport: ViewportSize): Promise<void>;
  setDefaultNavigationTimeout(timeout: number): Promise<void>;
  setDefaultTimeout(timeout: number): Promise<void>;
  goto(url: string, options: GotoOptions): Promise<BrowserResponse | null>;
  waitForFunction(expression: string, options: WaitForOptions): Promise<void>;
  waitForSelector(selector: string, options: WaitForOptions): Promise<void>;
  query(selector: string): Promise<ElementHandleAdapter | null>;
  screenshot(options: ScreenshotOptions): Promise<Buffer>;
  getUnderlyingObject(): unknown;
}

export interface BrowserAdapter {
  newPage(): Promise<PageAdapter>;
  close(): Promise<void>;
}

export async function launchBrowser(
  config: BrowserConfig = {},
  logger?: Logger,
): Promise<BrowserAdapter> {
  const {
    provider = 'puppeteer',
    headless = true,
    args = [],
    timeout = 60_000,
    executablePath,
  } = config;

  logger?.debug(`Launching ${provider} browser in ${headless ? 'headless' : 'headed'} mode`);
  logger?.debug('Browser args:', [...DEFAULT_ARGS, ...args]);

  if (provider === 'playwright') {
    const { browserName = 'chromium', channel } = config;
    const playwright = await loadPlaywright(logger);
    const browserType = playwright[browserName];

    logger?.debug(`Using Playwright browser engine: ${browserName}`);

    const browser = await browserType.launch({
      headless,
      args: [...DEFAULT_ARGS, ...args],
      timeout,
      ...(channel ? { channel } : {}),
      ...(executablePath ? { executablePath } : {}),
    });

    return new PlaywrightBrowserAdapter(browser);
  }

  const browser = await launchPuppeteer({
    headless: !headless ? false : 'shell',
    args: [...DEFAULT_ARGS, ...args],
    timeout,
    ...(executablePath ? { executablePath } : {}),
  });

  return new PuppeteerBrowserAdapter(browser);
}

export async function createPage(
  browser: BrowserAdapter,
  width = 1440,
  height = 900,
): Promise<PageAdapter> {
  const page = await browser.newPage();

  await page.setViewport({ width, height });
  await page.setDefaultNavigationTimeout(60_000);
  await page.setDefaultTimeout(30_000);

  return page;
}

export async function closeBrowser(browser: BrowserAdapter): Promise<void> {
  try {
    await browser.close();
  } catch {
    // Browser already closed
  }
}

type PlaywrightModule = typeof import('playwright');

async function loadPlaywright(logger?: Logger): Promise<PlaywrightModule> {
  try {
    return await import('playwright');
  } catch (error) {
    logger?.error('Playwright support requested, but the package is not installed');

    if (
      error instanceof Error &&
      (error.message.includes("Cannot find package 'playwright'") ||
        /* v8 ignore next */
        error.message.includes("Cannot find module 'playwright'"))
    ) {
      throw new Error(
        "Playwright support requires the 'playwright' package. Install it and run 'npx playwright install chromium'.",
        { cause: error },
      );
    }
    /* v8 ignore next */
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }
}

function normalizeScreenshot(data: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  return Buffer.from(data);
}

class PuppeteerElementAdapter implements ElementHandleAdapter {
  constructor(private readonly element: PuppeteerElementHandle) {}

  async boundingBox(): Promise<BoundingBox | null> {
    return this.element.boundingBox();
  }

  async evaluate<R>(pageFunction: (element: unknown) => R | Promise<R>): Promise<R> {
    return this.element.evaluate(pageFunction);
  }

  async screenshot(options: ScreenshotOptions): Promise<Buffer> {
    const screenshot = await this.element.screenshot(options);
    return normalizeScreenshot(screenshot);
  }

  getUnderlyingObject(): unknown {
    return this.element;
  }
}

class PuppeteerPageAdapter implements PageAdapter {
  constructor(private readonly page: PuppeteerPage) {}

  async setViewport(viewport: ViewportSize): Promise<void> {
    await this.page.setViewport(viewport);
  }

  async setDefaultNavigationTimeout(timeout: number): Promise<void> {
    this.page.setDefaultNavigationTimeout(timeout);
    return Promise.resolve();
  }

  async setDefaultTimeout(timeout: number): Promise<void> {
    this.page.setDefaultTimeout(timeout);
    return Promise.resolve();
  }

  async goto(url: string, options: GotoOptions): Promise<BrowserResponse | null> {
    return this.page.goto(url, options);
  }

  async waitForFunction(expression: string, options: WaitForOptions): Promise<void> {
    await this.page.waitForFunction(expression, options);
  }



  async waitForSelector(selector: string, options: WaitForOptions): Promise<void> {
    await this.page.waitForSelector(selector, options);
  }

  async query(selector: string): Promise<ElementHandleAdapter | null> {
    const element = (await this.page.$(selector)) as PuppeteerElementHandle | null;
    return element ? new PuppeteerElementAdapter(element) : null;
  }

  async screenshot(options: ScreenshotOptions): Promise<Buffer> {
    const screenshot = await this.page.screenshot(options);
    return normalizeScreenshot(screenshot);
  }

  getUnderlyingObject(): unknown {
    return this.page;
  }
}

class PuppeteerBrowserAdapter implements BrowserAdapter {
  constructor(private readonly browser: PuppeteerBrowser) {}

  async newPage(): Promise<PageAdapter> {
    return new PuppeteerPageAdapter(await this.browser.newPage());
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

class PlaywrightElementAdapter implements ElementHandleAdapter {
  constructor(private readonly locator: PlaywrightLocator) {}

  async boundingBox(): Promise<BoundingBox | null> {
    return this.locator.boundingBox();
  }

  async evaluate<R>(pageFunction: (element: unknown) => R | Promise<R>): Promise<R> {
    return this.locator.evaluate(pageFunction);
  }

  async screenshot(options: ScreenshotOptions): Promise<Buffer> {
    const screenshot = await this.locator.screenshot(options);
    return normalizeScreenshot(screenshot);
  }

  getUnderlyingObject(): unknown {
    return this.locator;
  }
}

class PlaywrightPageAdapter implements PageAdapter {
  constructor(private readonly page: PlaywrightPage) {}

  async setViewport(viewport: ViewportSize): Promise<void> {
    await this.page.setViewportSize(viewport);
  }

  async setDefaultNavigationTimeout(timeout: number): Promise<void> {
    this.page.setDefaultNavigationTimeout(timeout);
    return Promise.resolve();
  }

  async setDefaultTimeout(timeout: number): Promise<void> {
    this.page.setDefaultTimeout(timeout);
    return Promise.resolve();
  }

  async goto(url: string, options: GotoOptions): Promise<BrowserResponse | null> {
    return this.page.goto(url, options);
  }

  async waitForFunction(expression: string, options: WaitForOptions): Promise<void> {
    await this.page.waitForFunction(expression, options);
  }

  async waitForSelector(selector: string, options: WaitForOptions): Promise<void> {
    await this.page.locator(selector).first().waitFor({
      state: 'attached',
      timeout: options.timeout,
    });
  }

  async query(selector: string): Promise<ElementHandleAdapter | null> {
    const locator = this.page.locator(selector).first();
    const count = await locator.count();
    return count > 0 ? new PlaywrightElementAdapter(locator) : null;
  }

  async screenshot(options: ScreenshotOptions): Promise<Buffer> {
    const screenshot = await this.page.screenshot(options);
    return normalizeScreenshot(screenshot);
  }

  getUnderlyingObject(): unknown {
    return this.page;
  }
}

class PlaywrightBrowserAdapter implements BrowserAdapter {
  constructor(private readonly browser: PlaywrightBrowser) {}

  async newPage(): Promise<PageAdapter> {
    return new PlaywrightPageAdapter(await this.browser.newPage());
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
