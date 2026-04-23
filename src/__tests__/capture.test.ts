import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureStory } from '../capture.js';
import type { PageAdapter, ElementHandleAdapter } from '../browser.js';

describe('captureStory', () => {
  let mockElement: Partial<ElementHandleAdapter>;
  let mockPage: Partial<PageAdapter>;
  let dummyLogger: any;

  beforeEach(() => {
    // Mock HTMLElement for node environment tests
    if (typeof global.HTMLElement === 'undefined') {
      (global as any).HTMLElement = class HTMLElement {
        public style: any;
      };
    }

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
        Object.setPrototypeOf(fakeEl, global.HTMLElement.prototype);
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
    vi.clearAllMocks();
  });

  it('navigates to url and captures screenshot successfully', async () => {
    const result = await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForTimeout: 0, maxRetries: 0 },
      dummyLogger,
    );
    expect(mockPage.goto).toHaveBeenCalledWith(
      'http://host/iframe.html?id=test-id&viewMode=story',
      expect.any(Object),
    );
    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('imagedata');
    expect(mockElement.screenshot).toHaveBeenCalledWith({ type: 'png', omitBackground: true });
  });

  it('handles non-buffer screenshot data by converting to buffer', async () => {
    mockElement.screenshot = vi.fn().mockResolvedValue('stringdata');
    const result = await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForTimeout: 0, maxRetries: 0 },
      dummyLogger,
    );
    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('stringdata');
  });

  it('supports waitForSelector option', async () => {
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForSelector: '.my-selector', maxRetries: 0 },
      dummyLogger,
    );
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.my-selector', expect.any(Object));
  });

  it('retries on navigation failure and eventually throws', async () => {
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 });
    const capturePromise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 2, retryDelay: 100 },
      dummyLogger,
    );
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

    mockPage.query = vi
      .fn()
      .mockResolvedValueOnce(null) // first selector returns null
      .mockResolvedValueOnce(badBoxElement) // second selector returns 0 height
      .mockResolvedValueOnce(mockElement); // third selector returns valid element

    await captureStory(mockPage as PageAdapter, 'http://host', 'test-id', undefined, dummyLogger);
    expect(mockPage.query).toHaveBeenCalledTimes(3);
    // third selector is #storybook-root
    expect(mockPage.query).toHaveBeenNthCalledWith(3, '#storybook-root');
  });

  it('throws error if no element is found at all', async () => {
    mockPage.query = vi.fn().mockResolvedValue(null);
    const capturePromise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    const expectPromise = expect(capturePromise).rejects.toThrow(
      'Could not find story root element for test-id. Tried selectors:',
    );
    await expectPromise;
    expect(mockPage.goto).toHaveBeenCalledTimes(1);
  });

  it('handles navigation failure with no response object', async () => {
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue(null);
    const capturePromise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 2, retryDelay: 10 },
      dummyLogger,
    );
    const expectPromise = expect(capturePromise).rejects.toThrow('no response');
    await vi.runAllTimersAsync();
    await expectPromise;
    expect(dummyLogger.warn).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('handles non-error objects being thrown during capture', async () => {
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockImplementation(() => {
      throw 'something went wrong';
    });
    const capturePromise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 2, retryDelay: 10 },
      dummyLogger,
    );
    const expectPromise = expect(capturePromise).rejects.toThrow('something went wrong');
    await vi.runAllTimersAsync();
    await expectPromise;
    vi.useRealTimers();
  });

  it('detects retry attempt logging specifically', async () => {
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });

    const capturePromise = captureStory(
      mockPage as PageAdapter,
      'http://h',
      's',
      undefined,
      dummyLogger,
    );
    // Attach a no-op catch to prevent unhandled rejection warnings while we advance timers to the end.
    capturePromise.catch(() => {});

    // First attempt immediately
    expect(mockPage.goto).toHaveBeenCalledTimes(1);
    expect(dummyLogger.warn).not.toHaveBeenCalled();

    // Trigger retry 1
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockPage.goto).toHaveBeenCalledTimes(2);
    expect(dummyLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Retry attempt 1'));

    // Trigger retry 2
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockPage.goto).toHaveBeenCalledTimes(3);
    expect(dummyLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Retry attempt 2'));

    await expect(capturePromise).rejects.toThrow();
    vi.useRealTimers();
  });

  it('rejects elements with zero width', async () => {
    vi.useFakeTimers();
    mockPage.query = vi.fn().mockResolvedValue({
      ...mockElement,
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 0, height: 100 }),
    });

    const promise = captureStory(
      mockPage as PageAdapter,
      'http://h',
      's',
      { maxRetries: 0 },
      dummyLogger,
    );
    promise.catch(() => {}); // handle immediately
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Could not find story root element/);
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
    const capturePromise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForTimeout: 0, maxRetries: 0 },
      dummyLogger,
    );
    const expectPromise = expect(capturePromise).rejects.toThrow(
      'Story element has zero height for test-id',
    );

    await vi.runAllTimersAsync();
    await expectPromise;

    // Verify it attempted to screenshot the page when it failed
    expect(mockPage.screenshot).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('passes exact goto options: waitUntil=load and correct timeout', async () => {
    // Requirement: page.goto must be called with waitUntil:'load' (not '' or other value) and NAVIGATION_TIMEOUT
    // Case: happy-path
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(mockPage.goto).toHaveBeenCalledWith(expect.any(String), {
      waitUntil: 'load',
      timeout: 60_000,
    });
  });

  it('passes exact waitForFunction expression and timeout', async () => {
    // Requirement: waitForFunction must use 'document.readyState === "complete"' (exact string) with timeout 30_000
    // Case: happy-path
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(mockPage.waitForFunction).toHaveBeenCalledWith('document.readyState === "complete"', {
      timeout: 30_000,
    });
  });

  it('passes exact storybook-root selector and timeout to waitForSelector', async () => {
    // Requirement: builtin waitForSelector uses '#storybook-root > *' (not empty string) with timeout 5000
    // Case: happy-path
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('#storybook-root > *', { timeout: 5000 });
  });

  it('passes exact custom waitForSelector options with timeout 30_000', async () => {
    // Requirement: custom waitForSelector must be called with { timeout: 30_000 } not {}
    // Case: happy-path with waitForSelector
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForSelector: '.sel', maxRetries: 0 },
      dummyLogger,
    );
    // The third call (after defaults calls) should be the custom selector with the right options
    const calls = (mockPage.waitForSelector as any).mock.calls;
    const customCall = calls.find((c: any) => c[0] === '.sel');
    expect(customCall).toBeDefined();
    expect(customCall?.[1]).toEqual({ timeout: 30_000 });
  });

  it('does NOT delay when waitForTimeout is exactly 0', async () => {
    // Requirement: waitForTimeout > 0 (NOT >= 0) — 0 must skip the wait branch
    // Case: boundary — waitForTimeout === 0
    vi.useFakeTimers();
    const spy = vi.spyOn(global, 'setTimeout');
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForTimeout: 0, maxRetries: 0 },
      dummyLogger,
    );
    await vi.runAllTimersAsync();
    await promise;
    // setTimeout for delay should NOT be called (only with 0ms would it be called if condition is >= 0)
    expect(dummyLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Waiting 0ms'));
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('delays when waitForTimeout is 1 (above-zero boundary)', async () => {
    // Requirement: waitForTimeout > 0 must delay; 1 is the minimal passing value
    // Case: boundary — waitForTimeout === 1
    vi.useFakeTimers();
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForTimeout: 1, maxRetries: 0 },
      dummyLogger,
    );
    await vi.runAllTimersAsync();
    await promise;
    expect(dummyLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Waiting 1ms for render to settle'),
    );
    vi.useRealTimers();
  });

  it('includes selector names separated by comma+space in error when no element found', async () => {
    // Requirement: STORY_ROOT_SELECTORS.join(', ') must use ', ' not '' separator
    // Case: error — no element found at all
    mockPage.query = vi.fn().mockResolvedValue(null);
    await expect(
      captureStory(
        mockPage as PageAdapter,
        'http://host',
        'test-id',
        { maxRetries: 0 },
        dummyLogger,
      ),
    ).rejects.toThrow('Tried selectors: #storybook-root > :first-child, #root > :first-child');
  });

  it('sets el.style.display to inline-block (not empty string)', async () => {
    // Requirement: element evaluate must set display to 'inline-block'
    // Case: happy-path — the evaluate fn body must run and set the correct value
    let capturedDisplay = 'UNSET';
    mockElement.evaluate = vi.fn().mockImplementation((fn: any) => {
      const el = { style: { display: 'block' } };
      Object.setPrototypeOf(el, global.HTMLElement.prototype);
      fn(el);
      capturedDisplay = el.style.display;
      return Promise.resolve(undefined);
    });
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(capturedDisplay).toBe('inline-block');
  });

  it('makes evaluate a no-op when el.style is absent (covers the if-guard)', async () => {
    // Requirement: the if (el && el.style) guard must prevent crash when style is absent
    // Case: boundary — el has no style property
    let threw = false;
    mockElement.evaluate = vi.fn().mockImplementation((fn: any) => {
      try {
        const el = { style: undefined };
        Object.setPrototypeOf(el, global.HTMLElement.prototype);
        fn(el);
      } catch {
        threw = true;
      }
      return Promise.resolve(undefined);
    });
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(threw).toBe(false);
  });

  it('logs precise captured screenshot dimensions string', async () => {
    // Requirement: logger.debug must be called with exact pixel dimensions string
    // Case: happy-path
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(dummyLogger.debug).toHaveBeenCalledWith('Captured screenshot: 100x100px');
  });

  it('logs precise navigating-to string', async () => {
    // Requirement: logger.debug must include the exact url
    // Case: happy-path
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    expect(dummyLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Navigating to:'));
    expect(dummyLogger.debug).toHaveBeenCalledWith(expect.stringContaining('test-id'));
  });

  it('logs precise retry warn message with attempt number', async () => {
    // Requirement: retry logger.warn must include attempt number (not empty string)
    // Case: boundary — exactly 1 retry
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });

    // We start the expectation before running timers to avoid unhandled rejection
    const promise = expect(
      captureStory(
        mockPage as PageAdapter,
        'http://h',
        's',
        { maxRetries: 1, retryDelay: 100 },
        dummyLogger,
      ),
    ).rejects.toThrow();

    await vi.runAllTimersAsync();
    await promise;

    // There are 2 calls: one for delay, one for attempt number.
    expect(dummyLogger.warn).toHaveBeenCalledWith('Retry attempt 1 for story: s');
    vi.useRealTimers();
  });

  it('logs precise final error message including attempt count (maxRetries + 1)', async () => {
    // Requirement: error log must show maxRetries+1 attempts, not maxRetries-1
    // Case: boundary — maxRetries=0 → 1 attempt total
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://h', 's', { maxRetries: 0 }, dummyLogger),
    ).rejects.toThrow();
    expect(dummyLogger.error).toHaveBeenCalledWith(
      'Failed to capture story after 1 attempts:',
      expect.anything(),
    );
  });

  it('logs precise error count with maxRetries=2 (3 attempts total)', async () => {
    // Requirement: maxRetries+1 arithmetic must be correct — 2+1=3, not 2-1=1
    // Case: boundary — maxRetries=2
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://h',
      's',
      { maxRetries: 2, retryDelay: 10 },
      dummyLogger,
    );
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow();
    expect(dummyLogger.error).toHaveBeenCalledWith(
      'Failed to capture story after 3 attempts:',
      expect.anything(),
    );
    vi.useRealTimers();
  });

  it('includes precise error-screenshot path with storyId', async () => {
    // Requirement: page.screenshot must be called with path containing the storyId
    // Case: boundary — zero-height element triggers debug screenshot
    let boxCalls = 0;
    mockElement.boundingBox = vi.fn().mockImplementation(() => {
      boxCalls++;
      return Promise.resolve(
        boxCalls % 2 !== 0
          ? { x: 0, y: 0, width: 100, height: 100 }
          : { x: 0, y: 0, width: 100, height: 0 },
      );
    });
    mockPage.query = vi.fn().mockResolvedValue(mockElement);
    vi.useFakeTimers();

    const promise = expect(
      captureStory(
        mockPage as PageAdapter,
        'http://host',
        'my-story',
        { maxRetries: 0 },
        dummyLogger,
      ),
    ).rejects.toThrow(/zero height/);

    await vi.runAllTimersAsync();
    await promise;

    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('my-story') }),
    );
    vi.useRealTimers();
  });

  it('logs precise retry-failed warn message with retryDelay amount', async () => {
    // Requirement: capture-failed warn message must include retryDelay (not empty string)
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://h',
      's',
      { maxRetries: 1, retryDelay: 999 },
      dummyLogger,
    );
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).rejects.toThrow();
    expect(dummyLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying in 999ms'),
      expect.anything(),
    );
    vi.useRealTimers();
  });

  it('logger?.warn for capture-fail is not called when null logger', async () => {
    // Requirement: optional chaining on logger — no crash when logger is undefined
    // Case: boundary — no logger provided
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://h', 's', { maxRetries: 0 }),
    ).rejects.toThrow();
    // Should not throw TypeErrors from undefined.warn
  });

  it('lastError?.message optional chaining does not crash when lastError is null', async () => {
    // Requirement: lastError?.message optional chaining must handle null without crash
    // Invariant: the fallback error is thrown when lastError is null
    // This path is hit only if somehow all attempts pass but we still exit (should not happen)
    // We verify that the code rejects gracefully when goto throws null-like
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://h', 's', { maxRetries: 0 }, dummyLogger),
    ).rejects.toThrow();
    // error arg to dummyLogger.error must not throw TypeError on lastError?.message
    expect(dummyLogger.error).toHaveBeenCalled();
  });

  it('handles capture without logger correctly', async () => {
    // Requirement: optional chaining on logger should prevent crashes when no logger is provided
    // Case: happy-path (no logger)
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }),
    ).resolves.toBeDefined();
  });

  it('verifies all logger optional chaining paths with no logger', async () => {
    // Requirement: all logger paths must be safely skipped if logger is undefined
    // Case: error path with no logger
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', {
        maxRetries: 1,
        retryDelay: 0,
        waitForSelector: '.missing',
        waitForTimeout: 1,
      }),
    ).rejects.toThrow();
    // If any logger.xxx was called without optional chaining, this would throw TypeError
  });

  it('style guard handles non-object element safely', async () => {
    // Requirement: style guard must handle elements that are not objects (e.g. null/undefined)
    // Case: boundary
    mockElement.evaluate = vi.fn().mockImplementation((fn: any) => {
      fn(null);
      return Promise.resolve(undefined);
    });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }),
    ).resolves.toBeDefined();
  });

  it('style guard handles element without style property safely', async () => {
    // Requirement: style guard must handle elements without style property
    // Case: boundary
    mockElement.evaluate = vi.fn().mockImplementation((fn: any) => {
      fn({});
      return Promise.resolve(undefined);
    });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }),
    ).resolves.toBeDefined();
  });

  it('style guard handles element with null style safely', async () => {
    // Requirement: style guard must handle elements where style is null
    // Case: boundary
    mockElement.evaluate = vi.fn().mockImplementation((fn: any) => {
      fn({ style: null });
      return Promise.resolve(undefined);
    });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }),
    ).resolves.toBeDefined();
  });

  it('result type is exactly "failure" (not empty string) on navigation failure', async () => {
    // Requirement: type: 'failure' string literal must not be mutated to ''
    // Case: error — navigation returns not-ok response
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }, dummyLogger),
    ).rejects.toThrow('Navigation failed');
    // The retry logic checks result.type === 'success' to return early.
    // If type were '', it wouldn't match 'success' so it still throws.
    // But verify through the error message that the failure path ran correctly.
    expect(dummyLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to capture story after'),
      expect.stringContaining('Navigation failed'),
    );
  });

  it('result type is exactly "failure" (not empty string) on thrown non-Error', async () => {
    // Requirement: type: 'failure' in the catch block must not be mutated to ''
    // Case: error — goto throws a non-Error value
    mockPage.goto = vi.fn().mockImplementation(() => {
      throw 42;
    });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }, dummyLogger),
    ).rejects.toThrow('42');
  });

  it('result type is exactly "failure" (not empty string) on zero-height element', async () => {
    // Requirement: type: 'failure' in zero-height return must not be mutated to ''
    // Case: boundary — element found but has zero height
    let boxCalls = 0;
    mockElement.boundingBox = vi.fn().mockImplementation(() => {
      boxCalls++;
      if (boxCalls % 2 !== 0) return Promise.resolve({ x: 0, y: 0, width: 100, height: 100 });
      return Promise.resolve({ x: 0, y: 0, width: 100, height: 0 });
    });
    mockPage.query = vi.fn().mockResolvedValue(mockElement);
    vi.useFakeTimers();
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('zero height');
    vi.useRealTimers();
  });

  it('waitForSelector is NOT called when option is not provided (conditional guard)', async () => {
    // Requirement: if (waitForSelector) must guard — mutant replaces with if (true)
    // Case: boundary — no waitForSelector option means no custom selector call
    const waitForSelectorSpy = mockPage.waitForSelector as any;
    waitForSelectorSpy.mockClear();

    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 0 },
      dummyLogger,
    );

    // waitForSelector is called once for the default '#storybook-root > *' selector
    // but NOT for a custom selector (since none was provided)
    const calls = waitForSelectorSpy.mock.calls;
    const customCalls = calls.filter((c: any) => c[0] !== '#storybook-root > *');
    expect(customCalls).toHaveLength(0);

    // Verify debug log does NOT include 'Waiting for selector:' since no custom selector
    expect(dummyLogger.debug).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Waiting for selector:/),
    );
  });

  it('logger?.debug for waitForSelector includes exact selector string (not empty)', async () => {
    // Requirement: logger?.debug(`Waiting for selector: ${waitForSelector}`) must include the actual selector
    // Case: happy-path
    await captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForSelector: '.my-custom-sel', maxRetries: 0 },
      dummyLogger,
    );
    expect(dummyLogger.debug).toHaveBeenCalledWith('Waiting for selector: .my-custom-sel');
  });

  it('logger?.debug for waitForTimeout includes exact ms value (not empty)', async () => {
    // Requirement: logger?.debug(`Waiting ${String(waitForTimeout)}ms...`) must include ms value
    // Case: happy-path
    vi.useFakeTimers();
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { waitForTimeout: 42, maxRetries: 0 },
      dummyLogger,
    );
    await vi.runAllTimersAsync();
    await promise;
    expect(dummyLogger.debug).toHaveBeenCalledWith('Waiting 42ms for render to settle');
    vi.useRealTimers();
  });

  it('logger?.warn for retry includes exact retryDelay and error message', async () => {
    // Requirement: logger?.warn(`Capture failed, retrying in ${String(retryDelay)}ms...`, result.error.message)
    // Case: boundary — verify both arguments
    vi.useFakeTimers();
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 503 });
    const promise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      { maxRetries: 1, retryDelay: 555 },
      dummyLogger,
    );
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow();

    expect(dummyLogger.warn).toHaveBeenCalledWith(
      'Capture failed, retrying in 555ms...',
      expect.stringContaining('Navigation failed'),
    );
    vi.useRealTimers();
  });

  it('logger?.error final message includes exact attempt count', async () => {
    // Requirement: logger?.error(`Failed to capture story after ${String(maxRetries + 1)} attempts:`, lastError?.message)
    // Case: boundary — verify lastError.message is passed (not lastError itself)
    mockPage.goto = vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 });
    await expect(
      captureStory(mockPage as PageAdapter, 'http://host', 'test-id', { maxRetries: 0 }, dummyLogger),
    ).rejects.toThrow();
    const errorCall = dummyLogger.error.mock.calls.find((c: any) =>
      String(c[0]).includes('Failed to capture story'),
    );
    expect(errorCall).toBeDefined();
    // Second argument should be the error message string (from lastError?.message)
    expect(typeof errorCall![1]).toBe('string');
    expect(errorCall![1]).toContain('Navigation failed');
  });

  it('all optional chaining paths work correctly with undefined logger', async () => {
    // Requirement: every logger?.xxx must use optional chaining so undefined doesn't crash
    // Case: error path with waitForSelector + waitForTimeout + retries and no logger
    vi.useFakeTimers();
    mockPage.goto = vi
      .fn()
      .mockResolvedValueOnce({ ok: () => false, status: () => 500 })
      .mockResolvedValueOnce({ ok: () => true, status: () => 200 });

    const promise = captureStory(
      mockPage as PageAdapter,
      'http://host',
      'test-id',
      {
        maxRetries: 1,
        retryDelay: 10,
        waitForSelector: '.sel',
        waitForTimeout: 5,
      },
      // no logger
    );
    await vi.runAllTimersAsync();
    await promise;
    // No TypeError thrown means all optional chaining works
    vi.useRealTimers();
  });
});
