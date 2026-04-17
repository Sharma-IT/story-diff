import path from 'node:path';

import { StoryDiff, VisualRegressionError, SizeMismatchError, BaselineMissingError } from '../../src/index.js';
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

  // Requirement: StoryDiff can capture and save baselines
  // Case: happy-path
  // Invariant: it captures a valid PNG buffer and saves it if baseline is missing (or assert mode handles it)
  it('captures a story and compares it against baseline', async () => {
    // Act
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary',
      viewport: 'desktop',
    });

    // Assert
    expect(result.match).toBe(true);
    expect(result.diffPercentage).toBeLessThan(1);
  }, 30000);

  // Requirement: Handling globals
  // Case: happy-path
  // Invariant: Passing globals produces a different snapshot if the component relies on it
  it('applies globals correctly', async () => {
    // Act
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      viewport: 'desktop',
      globals: { theme: 'dark' },
    });

    // Assert
    expect(result.match).toBe(true);
  }, 30000);

  // Requirement: Batch processing via runAll
  // Case: happy-path
  // Invariant: Processes multiple definitions and returns array of results
  it('supports declarative batch execution via runAll', async () => {
    // Act
    const results = await diff.runAll([
      {
        componentName: 'Button',
        storyPath: 'components-button',
        stories: ['secondary'],
        viewports: ['mobile', 'tablet'],
      },
    ]);

    // Assert
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
    // Arrange: Create baseline with secondary button
    await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-secondary-desktop-size-jest',
      viewport: 'desktop',
    });

    // Act: Compare primary button against secondary baseline
    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-secondary-desktop-size-jest',
      viewport: 'desktop',
      comparison: { allowSizeMismatch: true }
    });

    // Assert
    await expect(promise).rejects.toThrow(VisualRegressionError);
  }, 30000);

  // Requirement: Flexible thresholds
  // Case: happy-path
  // Invariant: it passes if diff is within failureThreshold
  it('allows small diff when failureThreshold is set', async () => {
    // Arrange: Create baseline with primary button
    await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-threshold-test-jest',
      viewport: 'desktop',
    });

    // Act: Compare secondary button with high threshold
    const result = await diff.assertMatchesBaseline('components-button--secondary', {
      snapshotName: 'button-threshold-test-jest',
      viewport: 'desktop',
      comparison: {
        allowSizeMismatch: true,
        failureThreshold: 100,
        failureThresholdType: 'percent',
      },
    });

    // Assert
    expect(result.match).toBe(true);
  }, 30000);

  // Requirement: Image dimension validation
  // Case: error
  // Invariant: Throws SizeMismatchError when dimensions differ and not allowed
  it('throws SizeMismatchError when dimensions differ', async () => {
    // Arrange: Create baseline with async component (different size)
    await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'size-mismatch-base-jest',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    // Act: Compare button against async component baseline
    const promise = diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'size-mismatch-base-jest',
      viewport: 'desktop',
    });

    // Assert
    await expect(promise).rejects.toThrow(SizeMismatchError);
  }, 30000);

  // Requirement: Handling invalid story IDs
  // Case: boundary
  // Invariant: Throws or times out gracefully when story doesn't exist
  it('handles invalid storyId gracefully', async () => {
    // Act
    const promise = diff.assertMatchesBaseline('non-existent--story', {
      snapshotName: 'invalid-story',
      viewport: 'desktop',
    });

    // Assert
    await expect(promise).rejects.toThrow();
  }, 35000);

  // Requirement: Synchronization with async rendering
  // Case: happy-path
  // Invariant: waits for selector before capture
  it('waits for selector before capturing async component', async () => {
    // Act
    const result = await diff.assertMatchesBaseline('components-asynccomponent--default', {
      snapshotName: 'async-ready',
      viewport: 'desktop',
      waitForSelector: '#ready-element',
    });

    // Assert
    expect(result.match).toBe(true);
  }, 30000);

  // Requirement: Update mode
  // Case: happy-path
  // Invariant: overwrites existing baselines when update is true
  it('updates baselines when update flag is true', async () => {
    // Arrange: Create baseline with secondary button
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

    // Act: Update baseline with primary button
    const result = await updateDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'update-test-jest',
      viewport: 'desktop',
    });

    // Assert
    expect(result.match).toBe(true);
    await updateDiff.teardown();
  }, 60000);

  // Requirement: Prevent silent baseline creation
  // Case: error
  // Invariant: Throws BaselineMissingError when baseline is missing and failOnMissingBaseline is true
  it('throws BaselineMissingError when baseline is missing and failOnMissingBaseline is true', async () => {
    // Arrange
    const strictDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir,
      failOnMissingBaseline: true,
      browser: browserConfig,
    });
    await strictDiff.setup();

    // Act
    const promise = strictDiff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'never-created-baseline-jest',
      viewport: 'desktop',
    });

    // Assert
    await expect(promise).rejects.toThrow(BaselineMissingError);
    await strictDiff.teardown();
  }, 30000);
});
