import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  launchPuppeteerMock: vi.fn(),
  chromiumLaunchMock: vi.fn(),
  firefoxLaunchMock: vi.fn(),
  webkitLaunchMock: vi.fn(),
  shouldFailPlaywrightLoad: false,
}));

vi.mock('puppeteer', () => ({
  launch: mocks.launchPuppeteerMock,
}));

vi.mock('playwright', () => ({
  chromium: { launch: mocks.chromiumLaunchMock },
  firefox: { launch: mocks.firefoxLaunchMock },
  webkit: { launch: mocks.webkitLaunchMock },
}));

import { closeBrowser, createPage, launchBrowser } from '../browser.js';

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
    await expect(closeBrowser(adapter)).resolves.not.toThrow();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes browser that closes successfully without throwing', async () => {
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    mocks.launchPuppeteerMock.mockResolvedValue(browser);
    const adapter = await launchBrowser();
    await closeBrowser(adapter);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  describe('Puppeteer adapters', () => {
    it('exercises all Puppeteer wrapper methods with return value assertions', async () => {
      const expectedBox = { x: 0, y: 0, width: 10, height: 10 };
      const elementHandle = {
        boundingBox: vi.fn().mockResolvedValue(expectedBox),
        evaluate: vi.fn().mockImplementation((fn) => fn('el')),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('foo')),
      };
      const gotoResponse = { ok: () => true, status: () => 200 };
      const page = {
        setViewport: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        goto: vi.fn().mockResolvedValue(gotoResponse),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
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

      // Assert goto returns the response (not undefined from empty block)
      const gotoResult = await pageAdapter.goto('http://foo', { waitUntil: 'load', timeout: 1000 });
      expect(gotoResult).toBe(gotoResponse);
      expect(page.goto).toHaveBeenCalledWith('http://foo', { waitUntil: 'load', timeout: 1000 });

      // Assert waitForFunction delegates correctly
      await pageAdapter.waitForFunction('1+1', { timeout: 1000 });
      expect(page.waitForFunction).toHaveBeenCalledWith('1+1', { timeout: 1000 });

      // Assert waitForSelector delegates correctly
      await pageAdapter.waitForSelector('.foo', { timeout: 1000 });
      expect(page.waitForSelector).toHaveBeenCalledWith('.foo', { timeout: 1000 });

      const elAdapter = await pageAdapter.query('.foo');
      expect(elAdapter).toBeDefined();
      expect(elAdapter!.getUnderlyingObject()).toBe(elementHandle);

      // Assert boundingBox returns the delegate's result (not undefined from empty block)
      const box = await elAdapter!.boundingBox();
      expect(box).toEqual(expectedBox);

      // Assert evaluate returns the delegate's result (not undefined from empty block)
      const evalResult = await elAdapter!.evaluate((x) => x);
      expect(evalResult).toBe('el');

      // Assert screenshot returns a Buffer (not undefined from empty block)
      const elShot = await elAdapter!.screenshot({});
      expect(Buffer.isBuffer(elShot)).toBe(true);
      expect(elShot.toString()).toBe('foo');

      const s1 = await pageAdapter.screenshot({});
      expect(Buffer.isBuffer(s1)).toBe(true);
      expect(s1.toString()).toBe('\x01\x02\x03'); // Uint8Array [1, 2, 3] as buffer

      page.$.mockResolvedValueOnce(null);
      expect(await pageAdapter.query('.none')).toBeNull();

      await adapter.close();
      expect(browser.close).toHaveBeenCalled();
    });

    it('verifies log messages during launch', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any;
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser(
        { provider: 'puppeteer', headless: true, args: ['--no-sandbox'] },
        logger,
      );
      expect(logger.debug).toHaveBeenCalledWith('Launching puppeteer browser in headless mode');
      expect(logger.debug).toHaveBeenCalledWith(
        'Browser args:',
        expect.arrayContaining(['--no-sandbox']),
      );
    });

    it('logs "headed" when headless is false', async () => {
      const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser({ provider: 'puppeteer', headless: false }, logger);
      expect(logger.debug).toHaveBeenCalledWith('Launching puppeteer browser in headed mode');
    });

    it('passes headless:false to Puppeteer when headless is explicitly false', async () => {
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser({ headless: false });
      expect(mocks.launchPuppeteerMock).toHaveBeenCalledWith(
        expect.objectContaining({ headless: false }),
      );
    });

    it('passes headless:shell to Puppeteer when headless is true', async () => {
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser({ headless: true });
      expect(mocks.launchPuppeteerMock).toHaveBeenCalledWith(
        expect.objectContaining({ headless: 'shell' }),
      );
    });

    it('uses default provider puppeteer when none is specified', async () => {
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser();
      // Only Puppeteer mock should be called
      expect(mocks.launchPuppeteerMock).toHaveBeenCalledTimes(1);
      expect(mocks.chromiumLaunchMock).not.toHaveBeenCalled();
    });

    it('uses an empty args array by default (no extra args)', async () => {
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser();
      const callArgs = mocks.launchPuppeteerMock.mock.calls[0]?.[0];
      // 'Stryker was here' must not appear
      expect(callArgs?.args).not.toContain('Stryker was here');
      // Only the 7 DEFAULT_ARGS must appear
      expect(callArgs?.args).toHaveLength(7);
    });

    it('uses default provider puppeteer when none is specified', async () => {
      const browser = {
        newPage: vi.fn().mockResolvedValue({
          setViewport: vi.fn(),
          setDefaultNavigationTimeout: vi.fn(),
          setDefaultTimeout: vi.fn(),
        }),
        close: vi.fn(),
      };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser();
      expect(mocks.launchPuppeteerMock).toHaveBeenCalled();
    });

    it('uses default headless=true when not specified', async () => {
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser({});
      expect(mocks.launchPuppeteerMock).toHaveBeenCalledWith(
        expect.objectContaining({ headless: 'shell' }),
      );
    });

    it('passes executablePath to Puppeteer when provided', async () => {
      const browser = { close: vi.fn() };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      await launchBrowser({ executablePath: '/custom/path' });
      expect(mocks.launchPuppeteerMock).toHaveBeenCalledWith(
        expect.objectContaining({ executablePath: '/custom/path' }),
      );
    });
  });

  describe('Playwright adapters', () => {
    it('exercises all Playwright wrapper methods with return values and options', async () => {
      const waitForMock = vi.fn();
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
        goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue({
            waitFor: waitForMock,
            ...locator,
          }),
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

      const response = await pageAdapter.goto('http://bar', { waitUntil: 'load', timeout: 1000 });
      expect(response?.ok()).toBe(true);
      expect(response?.status()).toBe(200);

      await pageAdapter.waitForFunction('doc.ready', { timeout: 2000 });
      expect(page.waitForFunction).toHaveBeenCalledWith('doc.ready', { timeout: 2000 });

      await pageAdapter.waitForSelector('.bar', { timeout: 5000 });
      expect(waitForMock).toHaveBeenCalledWith({
        state: 'attached',
        timeout: 5000,
      });

      const elAdapter = await pageAdapter.query('.bar');
      expect(elAdapter).toBeDefined();
      expect(elAdapter!.getUnderlyingObject()).toHaveProperty('boundingBox');

      const box = await elAdapter!.boundingBox();
      expect(box).toEqual({ x: 0, y: 0, width: 10, height: 10 });

      const evalResult = await elAdapter!.evaluate((x) => `evaluated ${x}`);
      expect(evalResult).toBe('evaluated el');

      const elShot = await elAdapter!.screenshot({});
      expect(Buffer.isBuffer(elShot)).toBe(true);
      expect(elShot.toString()).toBe('stringdata');

      const pageShot = await pageAdapter.screenshot({});
      expect(Buffer.isBuffer(pageShot)).toBe(true);
      expect(pageShot.toString()).toBe('foo');

      page.locator().first().count = vi.fn().mockResolvedValue(0);
      expect(await pageAdapter.query('.none')).toBeNull();

      await adapter.close();
      expect(browser.close).toHaveBeenCalled();
    });

    it('logs Playwright engine when launching', async () => {
      const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
      const browser = { close: vi.fn() };
      mocks.chromiumLaunchMock.mockResolvedValue(browser);
      await launchBrowser({ provider: 'playwright', browserName: 'chromium' }, logger);
      expect(logger.debug).toHaveBeenCalledWith('Using Playwright browser engine: chromium');
    });

    it('passes channel and executablePath to Playwright when provided', async () => {
      const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
      const browser = { close: vi.fn() };
      mocks.chromiumLaunchMock.mockResolvedValue(browser);
      await launchBrowser(
        {
          provider: 'playwright',
          channel: 'chrome',
          executablePath: '/custom/playwright/path',
        },
        logger,
      );
      expect(mocks.chromiumLaunchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'chrome',
          executablePath: '/custom/playwright/path',
        }),
      );
    });

    it('normalizes Uint8Array screenshots to Buffer in Playwright adapter', async () => {
      const locator = {
        boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 5, height: 5 }),
        evaluate: vi.fn().mockImplementation((fn: any) => fn('el')),
        screenshot: vi.fn().mockResolvedValue(new Uint8Array([10, 20, 30])),
        count: vi.fn().mockResolvedValue(1),
      };
      const page = {
        setViewportSize: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        goto: vi.fn(),
        waitForFunction: vi.fn(),
        locator: vi
          .fn()
          .mockReturnValue({ first: vi.fn().mockReturnValue({ waitFor: vi.fn(), ...locator }) }),
        screenshot: vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
      };
      const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
      mocks.chromiumLaunchMock.mockResolvedValue(browser);

      const adapter = await launchBrowser({ provider: 'playwright' });
      const pageAdapter = await adapter.newPage();
      const elAdapter = await pageAdapter.query('.x');
      const buf = await elAdapter!.screenshot({});
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect([...buf]).toEqual([10, 20, 30]);

      const pageBuf = await pageAdapter.screenshot({});
      expect(pageBuf).toBeInstanceOf(Buffer);
      expect([...pageBuf]).toEqual([1, 2]);
    });

    it('normalizeScreenshot preserves exact bytes for Uint8Array input (not empty block)', async () => {
      const inputBytes = new Uint8Array([0xff, 0x00, 0xab, 0xcd]);
      const locator = {
        boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1, height: 1 }),
        evaluate: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockResolvedValue(inputBytes),
        count: vi.fn().mockResolvedValue(1),
      };
      const page = {
        setViewportSize: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        goto: vi.fn(),
        waitForFunction: vi.fn(),
        locator: vi
          .fn()
          .mockReturnValue({ first: vi.fn().mockReturnValue({ waitFor: vi.fn(), ...locator }) }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('already-buffer')),
      };
      const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
      mocks.chromiumLaunchMock.mockResolvedValue(browser);

      const adapter = await launchBrowser({ provider: 'playwright' });
      const pageAdapter = await adapter.newPage();
      const elAdapter = await pageAdapter.query('.x');
      const result = await elAdapter!.screenshot({});
      // The empty block mutant would return undefined
      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(4);
      expect(result[0]).toBe(0xff);
      expect(result[3]).toBe(0xcd);
    });

    it('Playwright waitForSelector passes state attached and exact timeout (not empty object or string)', async () => {
      const waitForMock = vi.fn();
      const page = {
        setViewportSize: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        goto: vi.fn(),
        waitForFunction: vi.fn(),
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue({
            waitFor: waitForMock,
            count: vi.fn().mockResolvedValue(0),
          }),
        }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('x')),
      };
      const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
      mocks.chromiumLaunchMock.mockResolvedValue(browser);

      const adapter = await launchBrowser({ provider: 'playwright' });
      const pageAdapter = await adapter.newPage();
      await pageAdapter.waitForSelector('#my-el', { timeout: 7777 });

      expect(waitForMock).toHaveBeenCalledTimes(1);
      expect(waitForMock).toHaveBeenCalledWith({
        state: 'attached',
        timeout: 7777,
      });
      // Verify state is exactly 'attached' not ''
      const callArg = waitForMock.mock.calls[0]![0];
      expect(callArg.state).toBe('attached');
      expect(callArg.timeout).toBe(7777);
    });

    it('normalizeScreenshot returns original Buffer instance', async () => {
      const input = Buffer.from('test');
      // We can't easily access normalizeScreenshot as it's internal, but we can trigger it via adapter
      const browser = {
        newPage: vi.fn().mockResolvedValue({
          screenshot: vi.fn().mockResolvedValue(input),
          setViewport: vi.fn(),
          setDefaultNavigationTimeout: vi.fn(),
          setDefaultTimeout: vi.fn(),
        }),
      };
      mocks.launchPuppeteerMock.mockResolvedValue(browser);
      const adapter = await launchBrowser({ provider: 'puppeteer' });
      const page = await adapter.newPage();
      const output = await page.screenshot({});
      expect(output).toBe(input);
    });
  });
});
