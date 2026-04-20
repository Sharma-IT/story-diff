import { describe, it, expect, vi } from 'vitest';
import { buildStoryUrl, waitForStorybookReady } from '../storybook.js';
import { StorybookConnectionError } from '../errors.js';
import type { PageAdapter } from '../browser.js';

describe('buildStoryUrl', () => {
  const BASE_URL = 'http://localhost:6006';

  it('builds a basic iframe URL for a story ID', () => {
    const url = buildStoryUrl(BASE_URL, 'components-button--primary');

    expect(url).toBe(
      'http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story',
    );
  });

  it('appends globals as URL parameters', () => {
    const url = buildStoryUrl(BASE_URL, 'components-button--primary', {
      theme: 'dark',
      locale: 'en-AU',
    });

    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).not.toBeNull();
    expect(globals).toContain('theme:dark');
    expect(globals).toContain('locale:en-AU');
  });

  it('omits globals parameter when globals is empty', () => {
    const url = buildStoryUrl(BASE_URL, 'my-story--default', {});

    expect(url).not.toContain('&globals=');
  });

  it('handles storybookUrl with trailing slash', () => {
    const url = buildStoryUrl('http://localhost:6006/', 'my-story--default');

    expect(url).toBe('http://localhost:6006/iframe.html?id=my-story--default&viewMode=story');
    expect(url).not.toContain('//iframe');
  });

  it('encodes special characters in globals values', () => {
    const url = buildStoryUrl(BASE_URL, 'test--story', {
      label: 'hello world',
    });

    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).not.toBeNull();
    expect(globals).toContain('hello world');
  });

  it('separates multiple globals with semicolons', () => {
    const url = buildStoryUrl(BASE_URL, 'test--story', {
      brand: 'qantas',
      theme: 'light',
    });

    const parsed = new URL(url);
    const globals = parsed.searchParams.get('globals');
    expect(globals).toContain(';');
    expect(globals).toContain('brand:qantas');
    expect(globals).toContain('theme:light');
  });

  it('strips multiple trailing slashes from storybookUrl', async () => {
    // Requirement: regex /\/+$/ must strip multiple trailing slashes, not just one
    // Case: boundary - double trailing slash
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await waitForStorybookReady(page, 'http://localhost:6006//');
    expect(page.goto).toHaveBeenCalledWith('http://localhost:6006', expect.any(Object));
  });

  it('uses exact goto options: waitUntil=domcontentloaded with given timeout', async () => {
    // Requirement: goto must use waitUntil:'domcontentloaded' (not '' or other)
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await waitForStorybookReady(page, 'http://localhost:6006', undefined, 55_000);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:6006', { waitUntil: 'domcontentloaded', timeout: 55_000 });
  });

  it('throws with precise HTTP status in error detail when response is not ok', async () => {
    // Requirement: StorybookConnectionError includes 'HTTP 404' in detail (not '')
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 }),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(page, 'http://localhost')).rejects.toThrow('HTTP 404');
  });

  it('throws with No response in error detail when goto returns null', async () => {
    // Requirement: StorybookConnectionError includes 'No response' in detail (not '')
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(page, 'http://localhost')).rejects.toThrow('No response');
  });

  it('response OK check must be active - ok=false throws, ok=true resolves', async () => {
    // Requirement: if (!response.ok()) block must execute when ok() is false
    const pageBad = {
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 }),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(pageBad, 'http://localhost')).rejects.toThrow();

    const pageGood = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(pageGood, 'http://localhost')).resolves.not.toThrow();
  });

  it('passes exact waitForSelector timeout of 15_000', async () => {
    // Requirement: waitForSelector called with { timeout: 15_000 } not {}
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await waitForStorybookReady(page, 'http://localhost');
    const call = (page.waitForSelector as any).mock.calls[0];
    expect(call?.[1]).toEqual({ timeout: 15_000 });
  });

  it('logs precise selector string in debug (not empty string)', async () => {
    // Requirement: debug log must include the actual selector string
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    await waitForStorybookReady(page, 'http://localhost', logger);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('#storybook-preview-iframe'));
    expect(logger.debug).toHaveBeenCalledWith('Found Storybook UI element: #storybook-preview-iframe');
  });

  it('logs precise error when no selectors are found (not empty string)', async () => {
    // Requirement: logger.error must say precise message, not ''
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;
    await expect(waitForStorybookReady(page, 'http://localhost', logger)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith('Storybook UI did not load - no expected selectors found');
  });

  it('logs precise error when no response from Storybook (not empty string)', async () => {
    // Requirement: logger.error must say 'No response from Storybook', not ''
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;
    await expect(waitForStorybookReady(page, 'http://localhost', logger)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith('No response from Storybook');
  });

  it('does not crash when logger is undefined (optional chaining)', async () => {
    // Requirement: logger?.error uses optional chaining, no crash when logger is undefined
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(page, 'http://localhost')).rejects.toThrow();
  });
});

describe('waitForStorybookReady', () => {
  it('resolves when storybook loads and first selector is found', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;

    await expect(waitForStorybookReady(page, 'http://localhost:6006')).resolves.toBeUndefined();
    expect(page.goto).toHaveBeenCalledWith('http://localhost:6006', expect.any(Object));
    expect(page.waitForSelector).toHaveBeenCalledWith('#storybook-preview-iframe', expect.any(Object));
  });

  it('tries next selector if first one fails', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(undefined),
    } as unknown as PageAdapter;

    await expect(waitForStorybookReady(page, 'http://localhost:6006')).resolves.toBeUndefined();
    expect(page.waitForSelector).toHaveBeenCalledTimes(2);
    expect(page.waitForSelector).toHaveBeenNthCalledWith(2, '#storybook-preview-wrapper', expect.any(Object));
  });

  it('throws StorybookConnectionError if goto returns null', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;

    await expect(waitForStorybookReady(page, 'http://localhost', logger)).rejects.toThrow(StorybookConnectionError);
    expect(logger.error).toHaveBeenCalled();
  });

  it('throws StorybookConnectionError if response is not ok', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 }),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;

    await expect(waitForStorybookReady(page, 'http://localhost', logger)).rejects.toThrow(StorybookConnectionError);
    expect(logger.error).toHaveBeenCalled();
  });

  it('throws StorybookConnectionError if no selectors are found', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;

    const promise = waitForStorybookReady(page, 'http://localhost', logger);
    await expect(promise).rejects.toThrow(StorybookConnectionError);
    await expect(promise).rejects.toThrow('expected selectors were found');
    expect(page.waitForSelector).toHaveBeenCalledTimes(4); // STORYBOOK_SELECTORS length
    expect(logger.error).toHaveBeenCalled();
  });

  it('uses logger if provided', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    await waitForStorybookReady(page, 'http://localhost:6006', logger);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking Storybook readiness'));
    expect(logger.info).toHaveBeenCalledWith('Storybook is ready');
  });

  it('tries all selectors sequentially', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockRejectedValueOnce(new Error('3'))
        .mockResolvedValueOnce(undefined),
    } as unknown as PageAdapter;

    await waitForStorybookReady(page, 'http://localhost:6006');
    expect(page.waitForSelector).toHaveBeenCalledTimes(4);
    expect(page.waitForSelector).toHaveBeenNthCalledWith(4, 'div[data-testid="preview-container"]', expect.any(Object));
  });

  it('strips multiple trailing slashes from storybookUrl', async () => {
    // Requirement: regex /\/+$/ must strip multiple trailing slashes, not just one
    // Case: boundary - double trailing slash
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await waitForStorybookReady(page, 'http://localhost:6006//');
    expect(page.goto).toHaveBeenCalledWith('http://localhost:6006', expect.any(Object));
  });

  it('uses exact goto options: waitUntil=domcontentloaded with given timeout', async () => {
    // Requirement: goto must use waitUntil:'domcontentloaded' (not '' or other)
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await waitForStorybookReady(page, 'http://localhost:6006', undefined, 55_000);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:6006', { waitUntil: 'domcontentloaded', timeout: 55_000 });
  });

  it('throws with precise HTTP status in error detail when response is not ok', async () => {
    // Requirement: StorybookConnectionError includes 'HTTP 404' in detail (not '')
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 }),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(page, 'http://localhost')).rejects.toThrow('HTTP 404');
  });

  it('throws with No response in error detail when goto returns null', async () => {
    // Requirement: StorybookConnectionError includes 'No response' in detail (not '')
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(page, 'http://localhost')).rejects.toThrow('No response');
  });

  it('response OK check must be active - ok=false throws, ok=true resolves', async () => {
    // Requirement: if (!response.ok()) block must execute when ok() is false
    const pageBad = {
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 }),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(pageBad, 'http://localhost')).rejects.toThrow();

    const pageGood = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(pageGood, 'http://localhost')).resolves.not.toThrow();
  });

  it('passes exact waitForSelector timeout of 15_000', async () => {
    // Requirement: waitForSelector called with { timeout: 15_000 } not {}
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    await waitForStorybookReady(page, 'http://localhost');
    const call = (page.waitForSelector as any).mock.calls[0];
    expect(call?.[1]).toEqual({ timeout: 15_000 });
  });

  it('logs precise selector string in debug (not empty string)', async () => {
    // Requirement: debug log must include the actual selector string
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn(),
    } as unknown as PageAdapter;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    await waitForStorybookReady(page, 'http://localhost', logger);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('#storybook-preview-iframe'));
    expect(logger.debug).toHaveBeenCalledWith('Found Storybook UI element: #storybook-preview-iframe');
  });

  it('logs precise error when no selectors are found (not empty string)', async () => {
    // Requirement: logger.error must say precise message, not ''
    const page = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;
    await expect(waitForStorybookReady(page, 'http://localhost', logger)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith('Storybook UI did not load - no expected selectors found');
  });

  it('logs precise error when no response from Storybook (not empty string)', async () => {
    // Requirement: logger.error must say 'No response from Storybook', not ''
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    const logger = { error: vi.fn(), debug: vi.fn() } as any;
    await expect(waitForStorybookReady(page, 'http://localhost', logger)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith('No response from Storybook');
  });

  it('does not crash when logger is undefined (optional chaining)', async () => {
    // Requirement: logger?.error uses optional chaining, no crash when logger is undefined
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as PageAdapter;
    await expect(waitForStorybookReady(page, 'http://localhost')).rejects.toThrow();
  });
});

