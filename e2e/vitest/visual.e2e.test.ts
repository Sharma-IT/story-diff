import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';

import {
  StoryDiff,
  VisualRegressionError,
  BaselineMissingError,
  SizeMismatchError,
  NotInitializedError,
} from '../../src/index.js';

describe('Story Diff (Vitest E2E)', () => {
  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/vitest');

  let diff: StoryDiff;

  beforeAll(async () => {
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      comparison: {
        allowSizeMismatch: false,
      },
      failOnMissingBaseline: false,
      // Logger configuration - can be set to 'silent', 'error', 'warn', 'info', or 'debug'
      // Default is 'silent', set to 'info' for E2E test visibility
      logger: {
        level: (process.env.LOG_LEVEL as any) || 'silent',
      },
      // Browser configuration - headless mode for CI, can be set to false for debugging
      browser: {
        headless: process.env.HEADLESS !== 'false',
      },
    });

    await diff.setup();
  }, 60_000);

  afterAll(async () => {
    if (diff) {
      await diff.teardown();
    }
  });

  it('captures a story and compares it against baseline', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    // On first run baselineCreated will be true, on subsequent runs it will be false
    // But match should always be true.
    expect(result.diffPercentage).toBeLessThan(1); // Should be very close to 0
  }, 30_000);

  it('applies globals correctly', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      viewport: 'desktop',
      globals: { theme: 'dark' },
    });

    expect(result.match).toBe(true);
  }, 30_000);

  it('supports declarative batch execution via runAll', async () => {
    const results = await diff.runAll([
      {
        componentName: 'Button',
        storyPath: 'components-button',
        stories: ['secondary'],
        viewports: ['mobile', 'tablet'],
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.result.match).toBe(true);
    expect(results[1]?.result.match).toBe(true);

    // Check naming convention
    const names = results.map((r) => r.snapshotName).sort();
    expect(names).toEqual(['button-secondary-mobile', 'button-secondary-tablet']);
  }, 60_000);

  it('throws VisualRegressionError when images differ', async () => {
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-secondary-desktop-size',
      viewport: 'desktop',
    });

    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-secondary-desktop-size',
      viewport: 'desktop',
      comparison: { allowSizeMismatch: true },
    });

    await expect(promise).rejects.toThrow(VisualRegressionError);
  }, 30_000);

  it('allows small diff when failureThreshold is set', async () => {
    await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-threshold-test',
      viewport: 'desktop',
    });

    const result = await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-threshold-test',
      viewport: 'desktop',
      comparison: {
        allowSizeMismatch: true,
        failureThreshold: 100,
        failureThresholdType: 'percent',
      },
    });

    expect(result.match).toBe(true);
    expect(result.diffPercentage).toBe(100);
  }, 30_000);

  it('throws SizeMismatchError when dimensions differ', async () => {
    await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'size-mismatch-base',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'size-mismatch-base',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(SizeMismatchError);
  }, 30_000);

  it('handles invalid storyId gracefully', async () => {
    const promise = diff.assertMatchesBaseline('non-existent--story', {
      snapshotName: 'invalid-story',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow();
  }, 35_000);

  it('waits for selector before capturing async component', async () => {
    const result = await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'async-ready',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    expect(result.match).toBe(true);
  }, 30_000);

  it('throws NotInitializedError when used before setup', async () => {
    const freshDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
    });

    await expect(freshDiff.captureStory('id')).rejects.toThrow(NotInitializedError);
  });

  it('automatically creates snapshots directory if it does not exist', async () => {
    const nestedDir = path.join(snapshotsDir, 'nested/deep/path');
    const nestedDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: nestedDir,
      failOnMissingBaseline: false,
    });
    await nestedDiff.setup();

    const result = await nestedDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'deep-snapshot',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    await nestedDiff.teardown();
  }, 30_000);

  it('updates baselines when update flag is true', async () => {
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'update-test',
      viewport: 'desktop',
    });

    const updateDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      update: true,
    });
    await updateDiff.setup();

    const result = await updateDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);

    await updateDiff.teardown();

    const finalResult = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test',
      viewport: 'desktop',
    });
    expect(finalResult.match).toBe(true);
  }, 60_000);

  it('throws BaselineMissingError when baseline is missing and failOnMissingBaseline is true', async () => {
    const strictDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      failOnMissingBaseline: true,
    });
    await strictDiff.setup();

    const promise = strictDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'never-created-baseline',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(BaselineMissingError);
    await strictDiff.teardown();
  }, 30_000);
});

describe('Story Diff Root Config Autoload (Vitest E2E)', () => {
  const repoRoot = process.cwd();
  const suiteRoot = path.join(repoRoot, 'e2e/vitest');
  let diff: StoryDiff;

  beforeAll(async () => {
    process.chdir(suiteRoot);
    diff = new StoryDiff();
    await diff.setup();
  }, 60_000);

  afterAll(async () => {
    if (diff) {
      await diff.teardown();
    }
    process.chdir(repoRoot);
  });

  it('auto-loads root config defaults without constructor config', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark-auto',
    });

    expect(result.match).toBe(true);
  }, 30_000);

  it('uses configured batch definitions when runAll is called without arguments', async () => {
    const results = await diff.runAll();

    expect(results).toHaveLength(1);
    expect(results[0]?.snapshotName).toBe('button-secondary-mobile');
    expect(results[0]?.result.match).toBe(true);
  }, 60_000);
});
