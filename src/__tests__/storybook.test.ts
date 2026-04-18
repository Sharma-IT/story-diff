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
    expect(logger.debug).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });
});

