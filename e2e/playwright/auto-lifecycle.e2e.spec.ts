import path from 'node:path';
import { expect, test } from '@playwright/test';
import { hookLifecycle, StoryDiff } from '../../src/index.js';

test.describe('Story Diff Auto Lifecycle (Playwright E2E)', () => {
  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/playwright-auto');
  
  const diff = new StoryDiff({
    storybookUrl: 'http://localhost:6006',
    snapshotsDir,
    failOnMissingBaseline: false,
    logger: {
      level: (process.env.LOG_LEVEL as any) || 'silent',
    },
    browser: {
      provider: 'playwright',
      browserName: 'chromium',
      headless: process.env.HEADLESS !== 'false',
    },
  });

  // Explicitly hook into Playwright Test lifecycle
  hookLifecycle(diff, {
    enabled: true,
    beforeAll: test.beforeAll,
    afterAll: test.afterAll,
  });

  test('captures a story with explicit lifecycle in Playwright', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-auto-playwright',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
  });
});
