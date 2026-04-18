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
});
