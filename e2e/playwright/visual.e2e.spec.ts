import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  BaselineMissingError,
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
