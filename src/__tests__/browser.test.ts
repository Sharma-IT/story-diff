import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  launchPuppeteerMock: vi.fn(),
  chromiumLaunchMock: vi.fn(),
  firefoxLaunchMock: vi.fn(),
  webkitLaunchMock: vi.fn(),
}));

vi.mock('puppeteer', () => ({
  launch: mocks.launchPuppeteerMock,
}));

vi.mock('playwright', () => ({
  chromium: { launch: mocks.chromiumLaunchMock },
  firefox: { launch: mocks.firefoxLaunchMock },
  webkit: { launch: mocks.webkitLaunchMock },
}));

import { createPage, launchBrowser } from '../browser.js';

describe('browser adapters', () => {
  beforeEach(() => {
    mocks.launchPuppeteerMock.mockReset();
    mocks.chromiumLaunchMock.mockReset();
    mocks.firefoxLaunchMock.mockReset();
    mocks.webkitLaunchMock.mockReset();
  });

  it('launches Puppeteer by default and configures pages through the adapter', async () => {
    const page = {
      setViewport: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn(),
    };

    mocks.launchPuppeteerMock.mockResolvedValue(browser);

    const adapter = await launchBrowser({
      headless: true,
      args: ['--custom-flag'],
      timeout: 12_345,
      executablePath: '/tmp/chrome',
    });

    await createPage(adapter, 1280, 720);

    expect(mocks.launchPuppeteerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: 'shell',
        timeout: 12_345,
        executablePath: '/tmp/chrome',
        args: expect.arrayContaining(['--custom-flag']),
      }),
    );
    expect(page.setViewport).toHaveBeenCalledWith({ width: 1280, height: 720 });
    expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(60_000);
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(30_000);
  });

  it('launches Playwright with the selected browser engine', async () => {
    const page = {
      setViewportSize: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn(),
    };

    mocks.chromiumLaunchMock.mockResolvedValue(browser);

    const adapter = await launchBrowser({
      provider: 'playwright',
      browserName: 'chromium',
      channel: 'chromium',
      headless: false,
      args: ['--playwright-flag'],
      timeout: 54_321,
    });

    await createPage(adapter, 1024, 768);

    expect(mocks.chromiumLaunchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: false,
        channel: 'chromium',
        timeout: 54_321,
        args: expect.arrayContaining(['--playwright-flag']),
      }),
    );
    expect(page.setViewportSize).toHaveBeenCalledWith({ width: 1024, height: 768 });
    expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(60_000);
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(30_000);
  });

  it('closes browser successfully and catches already-closed errors', async () => {
    const browser = { close: vi.fn().mockRejectedValue(new Error('Closed')) };
    mocks.launchPuppeteerMock.mockResolvedValue(browser);
    const adapter = await launchBrowser();
    await expect(import('../browser.js').then(m => m.closeBrowser(adapter))).resolves.not.toThrow();
  });

  describe('Puppeteer adapters', () => {
    it('exercises all Puppeteer wrapper methods', async () => {
      const elementHandle = {
        boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 10, height: 10 }),
        evaluate: vi.fn().mockImplementation((fn) => fn('el')),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('foo')),
      };
      const page = {
        setViewport: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        goto: vi.fn().mockResolvedValue({ ok: () => true }),
        waitForFunction: vi.fn(),
        waitForSelector: vi.fn(),
        $: vi.fn().mockResolvedValue(elementHandle),
        screenshot: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      };
      const browser = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn(),
      };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);

      const adapter = await launchBrowser();
      const pageAdapter = await adapter.newPage();
      
      expect(pageAdapter.getUnderlyingObject()).toBe(page);
      
      await pageAdapter.setViewport({ width: 100, height: 100 });
      expect(page.setViewport).toHaveBeenCalled();
      
      await pageAdapter.goto('http://foo', { waitUntil: 'load', timeout: 1000 });
      await pageAdapter.waitForFunction('1+1', { timeout: 1000 });
      await pageAdapter.waitForSelector('.foo', { timeout: 1000 });
      
      const elAdapter = await pageAdapter.query('.foo');
      expect(elAdapter).toBeDefined();
      expect(elAdapter!.getUnderlyingObject()).toBe(elementHandle);
      
      await elAdapter!.boundingBox();
      await elAdapter!.evaluate((x) => x);
      await elAdapter!.screenshot({});
      
      const s1 = await pageAdapter.screenshot({});
      expect(Buffer.isBuffer(s1)).toBe(true);
      
      page.$.mockResolvedValueOnce(null);
      expect(await pageAdapter.query('.none')).toBeNull();
      
      await adapter.close();
      expect(browser.close).toHaveBeenCalled();
    });
  });

  describe('Playwright adapters', () => {
    it('exercises all Playwright wrapper methods', async () => {
      const locator = {
        boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 10, height: 10 }),
        evaluate: vi.fn().mockImplementation((fn) => fn('el')),
        screenshot: vi.fn().mockResolvedValue('stringdata'), // should bufferise
        count: vi.fn().mockResolvedValue(1),
      };
      const page = {
        setViewportSize: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        goto: vi.fn(),
        waitForFunction: vi.fn(),
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue({
            waitFor: vi.fn(),
            ...locator
          })
        }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('foo')),
      };
      const browser = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn(),
      };
      mocks.chromiumLaunchMock.mockResolvedValue(browser);

      const adapter = await launchBrowser({ provider: 'playwright' });
      const pageAdapter = await adapter.newPage();
      
      expect(pageAdapter.getUnderlyingObject()).toBe(page);
      
      await pageAdapter.goto('http://bar', { waitUntil: 'load', timeout: 1000 });
      await pageAdapter.waitForFunction('1+1', { timeout: 1000 });
      await pageAdapter.waitForSelector('.bar', { timeout: 1000 });
      
      const elAdapter = await pageAdapter.query('.bar');
      expect(elAdapter).toBeDefined();
      expect(elAdapter!.getUnderlyingObject()).toHaveProperty('boundingBox');
      
      await elAdapter!.boundingBox();
      await elAdapter!.evaluate((x) => x);
      const elShot = await elAdapter!.screenshot({});
      expect(Buffer.isBuffer(elShot)).toBe(true);
      
      const pageShot = await pageAdapter.screenshot({});
      expect(Buffer.isBuffer(pageShot)).toBe(true);
      
      page.locator().first().count = vi.fn().mockResolvedValue(0);
      expect(await pageAdapter.query('.none')).toBeNull();
      
      await adapter.close();
      expect(browser.close).toHaveBeenCalled();
    });

    it('throws if playwright is not installed', async () => {
      vi.doMock('playwright', () => {
        throw new Error("Cannot find module 'playwright'");
      });

      const originalIncludes = String.prototype.includes;
      const spy = vi.spyOn(String.prototype, 'includes').mockImplementation(function(this: string, search: any) {
        if (typeof this === 'string' && originalIncludes.call(this, '[vitest] There was an error when mocking a module')) {
          if (search === "Cannot find module 'playwright'" || search === "Cannot find package 'playwright'") return true;
        }
        return originalIncludes.apply(this, arguments as any);
      });

      try {
        const { launchBrowser } = await import('../browser.js?cache-bust=' + Date.now());
        await expect(launchBrowser({ provider: 'playwright' })).rejects.toThrow(/npx playwright install chromium/);
      } finally {
        spy.mockRestore();
        vi.doUnmock('playwright');
      }
    });
  });
});
