import path from 'node:path';

import { StoryDiff, VisualRegressionError, SizeMismatchError, BaselineMissingError, NotInitializedError } from '../../src/index.js';
import type { BatchResult } from '../../src/story-diff.types.js';

describe('Story Diff (Jest E2E)', () => {
  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/jest');
  const browserConfig = {
    provider: 'puppeteer' as const,
    headless: process.env.HEADLESS !== 'false',
  };
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
      browser: browserConfig,
    });

    await diff.setup();
  }, 60000);

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
    expect(result.diffPercentage).toBeLessThan(1);
  }, 30000);

  it('applies globals correctly', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      viewport: 'desktop',
      globals: { theme: 'dark' },
    });

    expect(result.match).toBe(true);
  }, 30000);

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
    expect(results[0]!.result.match).toBe(true);
    expect(results[1]!.result.match).toBe(true);
    
    // Check naming convention
    const names = results.map((r: BatchResult) => r.snapshotName).sort();
    expect(names).toEqual(['button-secondary-mobile', 'button-secondary-tablet']);
  }, 60000);

  it('throws VisualRegressionError when images differ', async () => {
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-secondary-desktop-size-jest',
      viewport: 'desktop',
    });

    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-secondary-desktop-size-jest',
      viewport: 'desktop',
      comparison: { allowSizeMismatch: true }
    });

    await expect(promise).rejects.toThrow(VisualRegressionError);
  }, 30000);

  it('allows small diff when failureThreshold is set', async () => {
    await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-threshold-test-jest',
      viewport: 'desktop',
    });

    const result = await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-threshold-test-jest',
      viewport: 'desktop',
      comparison: {
        allowSizeMismatch: true,
        failureThreshold: 100,
        failureThresholdType: 'percent',
      },
    });

    expect(result.match).toBe(true);
  }, 30000);

  it('throws SizeMismatchError when dimensions differ', async () => {
    await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'size-mismatch-base-jest',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'size-mismatch-base-jest',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(SizeMismatchError);
  }, 30000);

  it('handles invalid storyId gracefully', async () => {
    const promise = diff.assertMatchesBaseline('non-existent--story', {
      snapshotName: 'invalid-story',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow();
  }, 35000);

  it('waits for selector before capturing async component', async () => {
    const result = await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'async-ready',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    expect(result.match).toBe(true);
  }, 30000);

  it('updates baselines when update flag is true', async () => {
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'update-test-jest',
      viewport: 'desktop',
    });

    const updateDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      update: true,
      browser: browserConfig,
    });
    await updateDiff.setup();

    const result = await updateDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test-jest',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    await updateDiff.teardown();
  }, 60000);

  it('throws NotInitializedError when used before setup', async () => {
    const freshDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      browser: browserConfig,
    });

    await expect(freshDiff.captureStory('id')).rejects.toThrow(NotInitializedError);
  });

  it('automatically creates snapshots directory if it does not exist', async () => {
    const nestedDir = path.join(snapshotsDir, 'nested/deep/path');
    const nestedDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: nestedDir,
      failOnMissingBaseline: false,
      browser: browserConfig,
    });
    await nestedDiff.setup();

    const result = await nestedDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'deep-snapshot',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    await nestedDiff.teardown();
  }, 30000);

  it('throws BaselineMissingError when baseline is missing and failOnMissingBaseline is true', async () => {
    const strictDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      failOnMissingBaseline: true,
      browser: browserConfig,
    });
    await strictDiff.setup();

    const promise = strictDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'never-created-baseline-jest',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(BaselineMissingError);
    await strictDiff.teardown();
  }, 30000);
});

describe('Story Diff Root Config Autoload (Jest E2E)', () => {
  const repoRoot = process.cwd();
  const suiteRoot = path.join(repoRoot, 'e2e/jest');
  let diff: StoryDiff;

  beforeAll(async () => {
    process.chdir(suiteRoot);
    diff = new StoryDiff();
    await diff.setup();
  }, 60000);

  afterAll(async () => {
    if (diff) {
      await diff.teardown();
    }
    process.chdir(repoRoot);
  });

  it('auto-loads root config defaults without constructor config', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark-auto-jest',
    });

    expect(result.match).toBe(true);
  }, 30000);

  it('uses configured batch definitions when runAll is called without arguments', async () => {
    const results = await diff.runAll();

    expect(results).toHaveLength(1);
    expect(results[0]!.snapshotName).toBe('button-secondary-mobile');
    expect(results[0]!.result.match).toBe(true);
  }, 60000);
});
