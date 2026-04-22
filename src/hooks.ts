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
  const enabled = config === true || (typeof config === 'object' && config.enabled !== false);
  if (!enabled) return;

  const lifecycleConfig = typeof config === 'object' ? config : {};
  const timeout = lifecycleConfig.timeout ?? 60_000;

  const globals = globalThis as unknown as Record<string, unknown>;
  const beforeAllHook =
    lifecycleConfig.beforeAll ??
    (typeof globals.beforeAll === 'function' ? (globals.beforeAll as LifecycleHook) : undefined);
  const afterAllHook =
    lifecycleConfig.afterAll ??
    (typeof globals.afterAll === 'function' ? (globals.afterAll as LifecycleHook) : undefined);

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
