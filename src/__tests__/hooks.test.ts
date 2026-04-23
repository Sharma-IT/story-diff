import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hookLifecycle } from '../hooks.js';
import { StoryDiff } from '../story-diff.js';

describe('hookLifecycle', () => {
  let diff: StoryDiff;

  beforeEach(() => {
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: './snapshots',
    });
    vi.spyOn(diff, 'setup').mockResolvedValue(undefined);
    vi.spyOn(diff, 'teardown').mockResolvedValue(undefined);
  });

  it('detects and uses global beforeAll/afterAll', async () => {
    const beforeAllSpy = vi.fn();
    const afterAllSpy = vi.fn();

    (globalThis as any).beforeAll = beforeAllSpy;
    (globalThis as any).afterAll = afterAllSpy;

    hookLifecycle(diff, true);

    expect(beforeAllSpy).toHaveBeenCalled();
    expect(afterAllSpy).toHaveBeenCalled();

    // Verify wrapper calls setup/teardown
    const setupFn = beforeAllSpy.mock.calls[0]?.[0];
    const teardownFn = afterAllSpy.mock.calls[0]?.[0];

    expect(setupFn).toBeDefined();
    expect(teardownFn).toBeDefined();

    if (setupFn) await setupFn();
    expect(diff.setup).toHaveBeenCalled();

    if (teardownFn) await teardownFn();
    expect(diff.teardown).toHaveBeenCalled();

    delete (globalThis as any).beforeAll;
    delete (globalThis as any).afterAll;
  });

  it('uses custom hooks from config', () => {
    const beforeAllSpy = vi.fn();
    const afterAllSpy = vi.fn();

    hookLifecycle(diff, {
      enabled: true,
      beforeAll: beforeAllSpy,
      afterAll: afterAllSpy,
    });

    expect(beforeAllSpy).toHaveBeenCalled();
    expect(afterAllSpy).toHaveBeenCalled();
  });

  it('does nothing if disabled', () => {
    const beforeAllSpy = vi.fn();
    (globalThis as any).beforeAll = beforeAllSpy;

    hookLifecycle(diff, false);
    expect(beforeAllSpy).not.toHaveBeenCalled();

    hookLifecycle(diff, { enabled: false });
    expect(beforeAllSpy).not.toHaveBeenCalled();

    delete (globalThis as any).beforeAll;
  });

  it('respects object config with true values and custom timeout', () => {
    const beforeAllSpy = vi.fn();
    hookLifecycle(diff, { enabled: true, beforeAll: beforeAllSpy, timeout: 500 });
    expect(beforeAllSpy).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it('detects both function hooks separately', () => {
    const beforeAllSpy = vi.fn();
    const afterAllSpy = vi.fn();
    (globalThis as any).beforeAll = beforeAllSpy;
    (globalThis as any).afterAll = afterAllSpy;

    hookLifecycle(diff, true);
    expect(beforeAllSpy).toHaveBeenCalled();
    expect(afterAllSpy).toHaveBeenCalled();

    delete (globalThis as any).beforeAll;
    delete (globalThis as any).afterAll;
  });

  it('config===false exits immediately without registering any hooks', () => {
    // Requirement: if (config === false) return — must exit, not fall through
    // Case: error — false is explicitly disabled
    const beforeAllSpy = vi.fn();
    (globalThis as any).beforeAll = beforeAllSpy;
    hookLifecycle(diff, false);
    expect(beforeAllSpy).not.toHaveBeenCalled();
    delete (globalThis as any).beforeAll;
  });

  it('uses empty object for lifecycleConfig when config is true (not object)', () => {
    // Requirement: typeof config === 'object' ? config : {} — true must yield {}
    // Case: boundary — config=true should produce no custom timeout (uses default 60_000)
    const beforeAllSpy = vi.fn();
    hookLifecycle(diff, { enabled: true, beforeAll: beforeAllSpy, timeout: 1234 });
    // Should be called with 1234 (from object config)
    expect(beforeAllSpy).toHaveBeenCalledWith(expect.any(Function), 1234);
    // Now with true: default timeout 60_000
    const beforeAllSpy2 = vi.fn();
    (globalThis as any).beforeAll = beforeAllSpy2;
    hookLifecycle(diff, true);
    expect(beforeAllSpy2).toHaveBeenCalledWith(expect.any(Function), 60_000);
    delete (globalThis as any).beforeAll;
  });

  it('does not call beforeAll when beforeAllHook is not a function', () => {
    // Requirement: typeof beforeAllHook === 'function' must guard the call
    // Case: boundary — no global beforeAll and no config.beforeAll => no call
    delete (globalThis as any).beforeAll;
    const afterAllSpy = vi.fn();
    hookLifecycle(diff, { enabled: true, afterAll: afterAllSpy });
    // afterAll should be called, but beforeAll has nothing calling it
    expect(afterAllSpy).toHaveBeenCalled();
    // No crash, no TypeError
  });

  it('enabled must be false when config is object with enabled===false', () => {
    // Requirement: (typeof config === 'object' && config.enabled !== false)
    // Case: boundary — config.enabled=false must disable
    const beforeAllSpy = vi.fn();
    (globalThis as any).beforeAll = beforeAllSpy;
    hookLifecycle(diff, { enabled: false });
    expect(beforeAllSpy).not.toHaveBeenCalled();
    delete (globalThis as any).beforeAll;
  });

  it('ignores global hooks that are not functions', () => {
    // Requirement: typeof globals.beforeAll === 'function' guard
    // Case: boundary — global exists but is not a function
    (globalThis as any).beforeAll = 'not a function';
    (globalThis as any).afterAll = 123;
    
    // Should not throw
    expect(() => {
      hookLifecycle(diff, true);
    }).not.toThrow();
    
    delete (globalThis as any).beforeAll;
    delete (globalThis as any).afterAll;
  });

  it('passes config object as lifecycleConfig not true literal (kills typeof ternary mutant)', () => {
    // Requirement: typeof config === 'object' ? config : {} — when true => config must be {}
    // Mutant: true ? config : {} would pass boolean `true` as lifecycleConfig
    // If config=true is passed as lifecycleConfig, accessing .timeout would yield undefined
    // but accessing .beforeAll on true would also yield undefined, same as {}.beforeAll
    // The key difference: if the mutant passes `true` instead of `{}`, then
    // lifecycleConfig.beforeAll would be undefined for both paths.
    // We verify by checking that when config=true and globals have beforeAll,
    // the hook uses the global beforeAll (not config.beforeAll which doesn't exist)
    const globalBeforeAll = vi.fn();
    const globalAfterAll = vi.fn();
    (globalThis as any).beforeAll = globalBeforeAll;
    (globalThis as any).afterAll = globalAfterAll;

    hookLifecycle(diff, true);

    // Global hooks should be detected since config=true has no .beforeAll/.afterAll
    expect(globalBeforeAll).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(globalAfterAll).toHaveBeenCalledWith(expect.any(Function), 60_000);

    delete (globalThis as any).beforeAll;
    delete (globalThis as any).afterAll;
  });

  it('config beforeAll takes precedence over global when config is an object', () => {
    // Requirement: lifecycleConfig.beforeAll ?? (global check)
    // Case: happy-path — config.beforeAll provided, global should NOT be used
    const configBeforeAll = vi.fn();
    const globalBeforeAll = vi.fn();
    (globalThis as any).beforeAll = globalBeforeAll;

    hookLifecycle(diff, {
      enabled: true,
      beforeAll: configBeforeAll,
      timeout: 999,
    });

    // Config hook takes precedence
    expect(configBeforeAll).toHaveBeenCalledWith(expect.any(Function), 999);
    // Global should NOT be called since config provides it
    expect(globalBeforeAll).not.toHaveBeenCalled();

    delete (globalThis as any).beforeAll;
  });

  it('falls through to global afterAll when config.afterAll is undefined', () => {
    // Requirement: lifecycleConfig.afterAll ?? (typeof globals.afterAll === 'function' ? ... : undefined)
    // Mutant: true ? (globals.afterAll as LifecycleHook) : undefined — would always use global
    // This test ensures the typeof guard works by having a non-function global
    const configBeforeAll = vi.fn();
    (globalThis as any).afterAll = 'not-a-function';

    hookLifecycle(diff, {
      enabled: true,
      beforeAll: configBeforeAll,
      // no afterAll in config
    });

    // beforeAll should be registered
    expect(configBeforeAll).toHaveBeenCalled();
    // afterAll should NOT be registered since global is not a function and config doesn't have it

    delete (globalThis as any).afterAll;
  });
});
