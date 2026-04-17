import type { StoryDiff } from './story-diff.js';
import type { LifecycleConfig, LifecycleHook } from './story-diff.types.js';

/**
 * Registers automatic lifecycle hooks for a StoryDiff instance.
 * Attempts to detect beforeAll and afterAll globally (e.g. from Vitest or Jest).
 * 
 * @param diff The StoryDiff instance to manage.
 * @param config Optional lifecycle configuration.
 */
export function hookLifecycle(diff: StoryDiff, config?: boolean | LifecycleConfig): void {
  if (config === false) return;

  const enabled = config === true || (typeof config === 'object' && config.enabled !== false);
  if (!enabled) return;

  const lifecycleConfig = typeof config === 'object' ? config : {};
  const timeout = lifecycleConfig.timeout ?? 60_000;

  const beforeAllHook: LifecycleHook | undefined = lifecycleConfig.beforeAll || (globalThis as any).beforeAll;
  const afterAllHook: LifecycleHook | undefined = lifecycleConfig.afterAll || (globalThis as any).afterAll;

  if (typeof beforeAllHook === 'function') {
    beforeAllHook(async () => {
      await diff.setup();
    }, timeout);
  }

  if (typeof afterAllHook === 'function') {
    afterAllHook(async () => {
      await diff.teardown();
    }, timeout);
  }
}
