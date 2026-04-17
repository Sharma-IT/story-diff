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
});
