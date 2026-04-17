import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  BaselineMissingError,
  NotInitializedError,
  SizeMismatchError,
  StoryDiff,
  VisualRegressionError,
} from '../../src/index.js';

test.describe('Story Diff (Playwright E2E)', () => {
  test.describe.configure({ mode: 'serial' });

  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/playwright');
  const browserConfig = {
    provider: 'playwright' as const,
    browserName: 'chromium' as const,
    headless: process.env.HEADLESS !== 'false',
  };

  let diff: StoryDiff;

  test.beforeAll(async () => {
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      comparison: {
        allowSizeMismatch: false,
      },
      failOnMissingBaseline: false,
      logger: {
        level: (process.env.LOG_LEVEL as any) || 'silent',
      },
      browser: browserConfig,
    });

    await diff.setup();
  });

  test.afterAll(async () => {
    if (diff) {
      await diff.teardown();
    }
  });

  test('captures and compares a baseline using the Playwright browser engine', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.diffPercentage).toBeLessThan(1);
  });

  test('supports declarative batch execution via runAll', async () => {
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
  });

  test('applies globals correctly', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      viewport: 'desktop',
      globals: { theme: 'dark' },
    });

    expect(result.match).toBe(true);
  });

  test('waits for async content before capturing', async () => {
    const result = await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'async-ready',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    expect(result.match).toBe(true);
  });

  test('throws VisualRegressionError when images differ', async () => {
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-secondary-desktop-size-playwright',
      viewport: 'desktop',
    });

    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-secondary-desktop-size-playwright',
      viewport: 'desktop',
      comparison: { allowSizeMismatch: true },
    });

    await expect(promise).rejects.toThrow(VisualRegressionError);
  });

  test('allows small diff when failureThreshold is set', async () => {
    await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-threshold-test-playwright',
      viewport: 'desktop',
    });

    const result = await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-threshold-test-playwright',
      viewport: 'desktop',
      comparison: {
        allowSizeMismatch: true,
        failureThreshold: 100,
        failureThresholdType: 'percent',
      },
    });

    expect(result.match).toBe(true);
    expect(result.diffPercentage).toBe(100);
  });

  test('throws SizeMismatchError when dimensions differ', async () => {
    await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'size-mismatch-base-playwright',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'size-mismatch-base-playwright',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(SizeMismatchError);
  });

  test('handles invalid storyId gracefully', async () => {
    const promise = diff.assertMatchesBaseline('non-existent--story', {
      snapshotName: 'invalid-story',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow();
  });

  test('throws NotInitializedError when used before setup', async () => {
    const freshDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      browser: browserConfig,
    });

    await expect(freshDiff.captureStory('id')).rejects.toThrow(NotInitializedError);
  });

  test('automatically creates snapshots directory if it does not exist', async () => {
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
  });

  test('updates baselines when update flag is true', async () => {
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'update-test-playwright',
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
      snapshotName: 'update-test-playwright',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);

    await updateDiff.teardown();

    const finalResult = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test-playwright',
      viewport: 'desktop',
    });
    expect(finalResult.match).toBe(true);
  });

  test('throws BaselineMissingError when failOnMissingBaseline is true', async () => {
    const strictDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      failOnMissingBaseline: true,
      browser: browserConfig,
    });

    await strictDiff.setup();

    const promise = strictDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'never-created-baseline-playwright',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(BaselineMissingError);
    await strictDiff.teardown();
  });
});

test.describe('Story Diff Root Config Autoload (Playwright E2E)', () => {
  test.describe.configure({ mode: 'serial' });

  const repoRoot = process.cwd();
  const suiteRoot = path.join(repoRoot, 'e2e/playwright');
  let diff: StoryDiff;

  test.beforeAll(async () => {
    process.chdir(suiteRoot);
    diff = new StoryDiff();
    await diff.setup();
  });

  test.afterAll(async () => {
    if (diff) {
      await diff.teardown();
    }
    process.chdir(repoRoot);
  });

  test('auto-loads root config defaults without constructor config', async () => {
    // Requirement: Consumers should be able to rely on a discovered root config file instead of wiring constructor config in hooks.
    // Case: happy-path
    // Invariant: A constructor-less instance should use discovered defaults for assertions.
    // Arrange

    // Act
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark-auto-playwright',
    });

    // Assert
    expect(result.match).toBe(true);
  });

  test('uses configured batch definitions when runAll is called without arguments', async () => {
    // Requirement: The root config may optionally own runAll definitions.
    // Case: happy-path
    // Invariant: Calling runAll without arguments should execute the configured batch tests.
    // Arrange

    // Act
    const results = await diff.runAll();

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshotName).toBe('button-secondary-mobile');
    expect(results[0]?.result.match).toBe(true);
  });
});
