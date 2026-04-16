import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StoryDiff } from '../story-diff.js';
import { BaselineMissingError } from '../errors.js';

// Mock browser and capture to avoid puppeteer overhead in unit tests
vi.mock('../browser.js', () => ({
  launchBrowser: vi.fn().mockResolvedValue({
    newPage: vi.fn(),
    close: vi.fn(),
  }),
  createPage: vi.fn().mockResolvedValue({
    setViewport: vi.fn(),
    goto: vi.fn(),
  }),
  closeBrowser: vi.fn(),
}));

vi.mock('../capture.js', () => ({
  captureStory: vi.fn().mockResolvedValue(Buffer.from('dummy-image')),
}));

vi.mock('../storybook.js', () => ({
  waitForStorybookReady: vi.fn(),
  buildStoryUrl: vi.fn().mockReturnValue('http://localhost:6006/iframe.html?id=some-story'),
}));

describe('StoryDiff - Baseline Handling', () => {
  let tempDir: string;
  let diff: StoryDiff;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-baseline-test-'));
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
    });
    await diff.setup();
  });

  afterEach(async () => {
    await diff.teardown();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // Requirement: Prevent silent baseline creation
  // Case: error
  // Invariant: Should throw BaselineMissingError when baseline is missing and update is false
  it('throws BaselineMissingError when baseline is missing and update is false (default)', async () => {
    // Arrange
    const snapshotName = 'non-existent-baseline';

    // Act & Assert
    await expect(diff.assertMatchesBaseline('some-story', { 
      snapshotName,
      viewport: 'desktop' 
    })).rejects.toThrow(BaselineMissingError);
  });

  // Requirement: Allow baseline creation in update mode
  // Case: happy-path
  // Invariant: Should create baseline and match when update is true
  it('creates baseline and matches when update is true', async () => {
    // Arrange
    const snapshotName = 'new-baseline-update';
    const updateDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      update: true,
    });
    await updateDiff.setup();

    // Act
    const result = await updateDiff.assertMatchesBaseline('some-story', {
      snapshotName,
      viewport: 'desktop',
    });

    // Assert
    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, `${snapshotName}.png`))).toBe(true);
    
    await updateDiff.teardown();
  });

  // Requirement: Opt-out of failure
  // Case: happy-path
  // Invariant: Should maintain legacy behavior when failOnMissingBaseline is false
  it('maintains legacy behavior (creates baseline) when failOnMissingBaseline is false', async () => {
    // Arrange
    const snapshotName = 'legacy-creation';
    const legacyDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await legacyDiff.setup();

    // Act
    const result = await legacyDiff.assertMatchesBaseline('some-story', {
      snapshotName,
      viewport: 'desktop',
    });

    // Assert
    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, `${snapshotName}.png`))).toBe(true);
    
    await legacyDiff.teardown();
  });

  // Requirement: Directory creation
  // Case: happy-path
  // Invariant: Should create nested directories even if missing and failOnMissingBaseline is false
  it('creates nested directories when failOnMissingBaseline is false', async () => {
    // Arrange
    const nestedDir = path.join(tempDir, 'a/b/c');
    const snapshotName = 'nested-test';
    const nestedDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: nestedDir,
      failOnMissingBaseline: false,
    });
    await nestedDiff.setup();

    // Act
    await nestedDiff.assertMatchesBaseline('some-story', {
      snapshotName,
      viewport: 'desktop',
    });

    // Assert
    expect(fs.existsSync(path.join(nestedDir, `${snapshotName}.png`))).toBe(true);
    await nestedDiff.teardown();
  });
});
