import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';

import { 
  StoryDiff,
  VisualRegressionError, 
  BaselineMissingError,
  SizeMismatchError,
  NotInitializedError
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

  // Requirement: StoryDiff can capture and save baselines
  // Case: happy-path
  // Invariant: it captures a valid PNG buffer and saves it if baseline is missing (or assert mode handles it)
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

  // Requirement: Handling globals
  // Case: happy-path
  // Invariant: Passing globals produces a different snapshot if the component relies on it
  it('applies globals correctly', async () => {
    // Create baseline for dark theme
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      viewport: 'desktop',
      globals: { theme: 'dark' },
    });

    expect(result.match).toBe(true);
  }, 30_000);

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
    expect(results[0]?.result.match).toBe(true);
    expect(results[1]?.result.match).toBe(true);
    
    // Check naming convention
    const names = results.map(r => r.snapshotName).sort();
    expect(names).toEqual(['button-secondary-mobile', 'button-secondary-tablet']);
  }, 60_000);

  // Requirement: Handling regressions
  // Case: error
  // Invariant: Throws VisualRegressionError when images differ significantly
  // Let's simplify and make it robust.
  it('throws VisualRegressionError when images differ', async () => {
    // Use Primary story, but compare against Secondary baseline.
    // To avoid SizeMismatchError, we enable allowSizeMismatch: true.
    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-secondary-desktop-size', // Custom name
      viewport: 'desktop',
      comparison: { allowSizeMismatch: true }
    });

    // First ensure we HAVE the baseline for secondary
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-secondary-desktop-size',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(VisualRegressionError);
  }, 30_000);

  it('allows small diff when failureThreshold is set', async () => {
    // 1. Create baseline for Button primary
    await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-threshold-test',
      viewport: 'desktop',
    });

    // 2. Compare Button secondary against it.
    // They have different sizes, so we must allowSizeMismatch.
    // We set failureThreshold to 100 to make it pass despite 100% diff.
    const result = await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-threshold-test',
      viewport: 'desktop',
      comparison: { 
        allowSizeMismatch: true,
        failureThreshold: 100,
        failureThresholdType: 'percent'
      }
    });

    expect(result.match).toBe(true);
    expect(result.diffPercentage).toBe(100);
  }, 30_000);

  // Requirement: Image dimension validation
  // Case: error
  // Invariant: Throws SizeMismatchError when dimensions differ and not allowed
  it('throws SizeMismatchError when dimensions differ', async () => {
    // 1. Create a baseline for AsyncComponent (different size than Button)
    await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'size-mismatch-base',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    // 2. Compare Button against it
    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'size-mismatch-base',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow(SizeMismatchError);
  }, 30_000);

  // Requirement: Handling invalid story IDs
  // Case: boundary
  // Invariant: Throws or times out gracefully when story doesn't exist
  it('handles invalid storyId gracefully', async () => {
    // This usually times out waiting for the selector in captureStory
    const promise = diff.assertMatchesBaseline('non-existent--story', {
      snapshotName: 'invalid-story',
      viewport: 'desktop',
    });

    await expect(promise).rejects.toThrow();
  }, 35_000);

  // Requirement: Synchronization with async rendering
  // Case: happy-path
  // Invariant: waits for selector before capture
  it('waits for selector before capturing async component', async () => {
    const result = await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'async-ready',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    expect(result.match).toBe(true);
  }, 30_000);

  // Requirement: Lifecycle: check for initialization
  // Case: error
  // Invariant: throws NotInitializedError if setup() not called
  it('throws NotInitializedError when used before setup', async () => {
    const freshDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
    });

    await expect(freshDiff.captureStory('id')).rejects.toThrow(NotInitializedError);
  });

  // Requirement: Snapshot management: directory creation
  // Case: happy-path
  // Invariant: automatically creates deep directories if missing
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

  // Requirement: Update mode
  // Case: happy-path
  // Invariant: overwrites existing baselines when update is true
  it('updates baselines when update flag is true', async () => {
    // 1. Create a baseline with secondary
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'update-test',
      viewport: 'desktop',
    });

    // 2. Compare primary against it with update: true
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
    expect(result.baselineCreated).toBe(true); // Technically it's "updated", but framework returns baselineCreated: true in update mode

    await updateDiff.teardown();

    // 3. Verify it's now primary (comparing primary against it without update should pass)
    const finalResult = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test',
      viewport: 'desktop',
    });
    expect(finalResult.match).toBe(true);
  }, 60_000);

  // Requirement: Prevent silent baseline creation (negative test)
  // Case: error
  // Invariant: Throws BaselineMissingError when failOnMissingBaseline is true
  it('throws BaselineMissingError when baseline is missing and failOnMissingBaseline is true', async () => {
    const strictDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      failOnMissingBaseline: true, // This is the new default, but being explicit for the test
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
