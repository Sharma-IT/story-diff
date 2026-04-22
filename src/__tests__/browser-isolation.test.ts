import { expect, it, vi } from 'vitest';

it('throws if playwright is not installed', async () => {
  vi.doMock('playwright', () => {
    throw new Error("Cannot find package 'playwright'");
  });

  const originalIncludes = String.prototype.includes;
  const spy = vi.spyOn(String.prototype, 'includes').mockImplementation(function (
    this: string,
    search: any,
  ) {
    if (
      typeof this === 'string' &&
      originalIncludes.call(this, '[vitest] There was an error when mocking a module')
    ) {
      if (search === "Cannot find package 'playwright'") return true;
    }
    return originalIncludes.apply(this, arguments as any);
  });

  try {
    const { launchBrowser } = await import('../browser.js?cacheBust=' + Date.now());
    const logger = { error: vi.fn(), debug: vi.fn() } as any;

    await expect(launchBrowser({ provider: 'playwright' }, logger)).rejects.toThrow(
      /npx playwright install chromium/,
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Playwright support requested, but the package is not installed',
    );
  } finally {
    spy.mockRestore();
    vi.doUnmock('playwright');
  }
});
