import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { StoryDiff } from '../../src/index.js';

// Requirement: StoryDiff should automatically handle setup and teardown in Jest if autoLifecycle is enabled
// Case: happy-path
// Invariant: Test passes without manual beforeAll/afterAll calls
describe('Story Diff Auto Lifecycle (Jest E2E)', () => {
  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/jest-auto');

  const diff = new StoryDiff({
    storybookUrl: 'http://localhost:6006',
    snapshotsDir,
    autoLifecycle: true,
    failOnMissingBaseline: false,
    logger: {
      level: (process.env.LOG_LEVEL as any) || 'silent',
    },
    // Using puppeteer for Jest E2E by default as per existing tests
    browser: {
      headless: process.env.HEADLESS !== 'false',
    },
  });

  it('captures a story with automatic lifecycle in Jest', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-auto-jest',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
  }, 30_000);
});
