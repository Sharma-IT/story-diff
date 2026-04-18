import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureStory } from '../capture.js';
import type { PageAdapter, ElementHandleAdapter } from '../browser.js';

describe('captureStory', () => {
  let mockElement: Partial<ElementHandleAdapter>;
  let mockPage: Partial<PageAdapter>;
  let dummyLogger: any;

  beforeEach(() => {
    dummyLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockElement = {
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 100 }),
      // Call the function to cover the evaluation logic in capture.ts
      evaluate: vi.fn().mockImplementation((fn) => {
        const fakeEl = { style: { display: '' } };
        return Promise.resolve(fn(fakeEl as any));
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('imagedata')),
    };

    mockPage = {
      goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue(mockElement),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('pageimage')),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigates to url and captures screenshot successfully', async () => {
    const result = await captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { waitForTimeout: 1 }, dummyLogger);
    expect(mockPage.goto).toHaveBeenCalledWith('http://host/iframe.html?id=test-id&viewMode=story', expect.any(Object));
    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('imagedata');
    expect(mockElement.screenshot).toHaveBeenCalledWith({ type: 'png', omitBackground: true });
  });

  it('handles non-buffer screenshot data by converting to buffer', async () => {
    mockElement.screenshot = vi.fn().mockResolvedValue('stringdata');
    const result = await captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { waitForTimeout: 0 }, dummyLogger);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('stringdata');
  });

  it('supports waitForSelector option', async () => {
    await captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { waitForSelector: '.my-selector' }, dummyLogger);
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.my-selector', expect.any(Object));
  });

  it('retries on navigation failure and eventually throws', async () => {
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 });
    const capturePromise = captureStory(mockPage as PageAdapter, 'http://host', 'test-id', undefined, dummyLogger);
    const expectPromise = expect(capturePromise).rejects.toThrow('Navigation failed');
    await vi.runAllTimersAsync();
    await expectPromise;
    // It should have retried 2 times (3 attempts total)
    expect(mockPage.goto).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('searches multiple root selectors and ignores zero height elements', async () => {
    const badBoxElement = {
      ...mockElement,
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 0 }),
    };

    mockPage.query = vi.fn()
      .mockResolvedValueOnce(null) // first selector returns null
      .mockResolvedValueOnce(badBoxElement) // second selector returns 0 height
      .mockResolvedValueOnce(mockElement); // third selector returns valid element

    await captureStory(mockPage as PageAdapter, 'http://host', 'test-id', undefined, dummyLogger);
    expect(mockPage.query).toHaveBeenCalledTimes(3);
    // third selector is #storybook-root
    expect(mockPage.query).toHaveBeenNthCalledWith(3, '#storybook-root');
  });

  it('throws error if no element is found at all', async () => {
    vi.useFakeTimers();
    mockPage.query = vi.fn().mockResolvedValue(null);
    const capturePromise = captureStory(mockPage as PageAdapter, 'http://host', 'test-id', undefined, dummyLogger);
    const expectPromise = expect(capturePromise).rejects.toThrow('Could not find story root element for test-id. Tried selectors:');
    await vi.runAllTimersAsync();
    await expectPromise;
    expect(mockPage.goto).toHaveBeenCalledTimes(3);
  });

  it('handles navigation failure with no response object', async () => {
    mockPage.goto = vi.fn().mockResolvedValue(null);
    vi.useFakeTimers();
    const capturePromise = captureStory(mockPage as PageAdapter, 'http://host', 'test-id', undefined, dummyLogger);
    const expectPromise = expect(capturePromise).rejects.toThrow('no response');
    await vi.runAllTimersAsync();
    await expectPromise;
    expect(dummyLogger.warn).toHaveBeenCalled();
  });

  it('handles non-error objects being thrown during capture', async () => {
    mockPage.goto = vi.fn().mockImplementation(() => { throw "something went wrong" });
    vi.useFakeTimers();
    const capturePromise = captureStory(mockPage as PageAdapter, 'http://host', 'test-id', undefined, dummyLogger);
    const expectPromise = expect(capturePromise).rejects.toThrow('something went wrong');
    await vi.runAllTimersAsync();
    await expectPromise;
  });

  it('throws error if found element has zero height right before capture', async () => {
    // Dynamically alternate boundingBox resolution to always pass findStoryRoot but fail the capture check.
    let boxCalls = 0;
    mockElement.boundingBox = vi.fn().mockImplementation(() => {
      boxCalls++;
      // findStoryRoot is called first, captureStory's check is called second for every retry loop
      if (boxCalls % 2 !== 0) return Promise.resolve({ x: 0, y: 0, width: 100, height: 100 });
      return Promise.resolve({ x: 0, y: 0, width: 100, height: 0 });
    });

    // Wait, findStoryRoot uses boundingBox, evaluate, then boundingBox again
    mockPage.query = vi.fn().mockResolvedValue(mockElement);

    vi.useFakeTimers();
    const capturePromise = captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { waitForTimeout: 0 }, dummyLogger);
    const expectPromise = expect(capturePromise).rejects.toThrow('Story element has zero height for test-id');
    
    await vi.runAllTimersAsync();
    await expectPromise;
      
    // Verify it attempted to screenshot the page when it failed
    expect(mockPage.screenshot).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
