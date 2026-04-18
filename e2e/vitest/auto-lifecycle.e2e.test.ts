import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { StoryDiff } from '../../src/index.js';

describe('Story Diff Auto Lifecycle (Vitest E2E)', () => {
  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/vitest-auto');

  const diff = new StoryDiff({
    storybookUrl: 'http://localhost:6006',
    snapshotsDir,
    autoLifecycle: {
      enabled: true,
      beforeAll,
      afterAll,
    },
    failOnMissingBaseline: false,
    logger: {
      level: (process.env.LOG_LEVEL as any) || 'silent',
    },
    browser: {
      headless: process.env.HEADLESS !== 'false',
    },
  });

  it('captures a story with automatic lifecycle', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-auto',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
  }, 30_000);
});
