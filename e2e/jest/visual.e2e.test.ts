import path from 'node:path';

import { StoryDiff, VisualRegressionError, SizeMismatchError } from '../../src/index.js';
import type { BatchResult } from '../../src/story-diff.types.js';

describe('Story Diff (Jest E2E)', () => {
  const snapshotsDir = path.join(process.cwd(), 'e2e/snapshots/jest');
  let diff: StoryDiff;

  beforeAll(async () => {
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      comparison: {
        allowSizeMismatch: false,
      },
    });

    await diff.setup();
  }, 60000);

  afterAll(async () => {
    if (diff) {
      await diff.teardown();
    }
  });

  // Requirement: StoryDiff can capture and save baselines
  // Case: happy-path
  // Invariant: it captures a valid PNG buffer and saves it if baseline is missing (or assert mode handles it)
  it('captures a story and compares it against baseline', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.diffPercentage).toBeLessThan(1);
  }, 30000);

  // Requirement: Handling globals
  // Case: happy-path
  // Invariant: Passing globals produces a different snapshot if the component relies on it
  it('applies globals correctly', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      viewport: 'desktop',
      globals: { theme: 'dark' },
    });

    expect(result.match).toBe(true);
  }, 30000);

  // Requirement: Batch processing via runAll
  // Case: happy-path
  // Invariant: Processes multiple definitions and returns array of results
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

  // Requirement: Handling regressions
  // Case: error
  // Invariant: Throws VisualRegressionError when images differ significantly
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

  // Requirement: Flexible thresholds
  // Case: happy-path
  // Invariant: it passes if diff is within failureThreshold
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

  // Requirement: Image dimension validation
  // Case: error
  // Invariant: Throws SizeMismatchError when dimensions differ and not allowed
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
    });
    await updateDiff.setup();

    const result = await updateDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test-jest',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    await updateDiff.teardown();
  }, 60000);
});
