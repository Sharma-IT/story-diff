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

  it('throws BaselineMissingError when baseline is missing and update is false (default)', async () => {
    const snapshotName = 'non-existent-baseline';

    await expect(diff.assertMatchesBaseline('some-story', { 
      snapshotName,
      viewport: 'desktop' 
    })).rejects.toThrow(BaselineMissingError);
  });

  it('creates baseline and matches when update is true', async () => {
    const snapshotName = 'new-baseline-update';
    const updateDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      update: true,
    });
    await updateDiff.setup();

    const result = await updateDiff.assertMatchesBaseline('some-story', {
      snapshotName,
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, `${snapshotName}.png`))).toBe(true);
    
    await updateDiff.teardown();
  });

  it('maintains legacy behavior (creates baseline) when failOnMissingBaseline is false', async () => {
    const snapshotName = 'legacy-creation';
    const legacyDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await legacyDiff.setup();

    const result = await legacyDiff.assertMatchesBaseline('some-story', {
      snapshotName,
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, `${snapshotName}.png`))).toBe(true);
    
    await legacyDiff.teardown();
  });

  it('creates nested directories when failOnMissingBaseline is false', async () => {
    const nestedDir = path.join(tempDir, 'a/b/c');
    const snapshotName = 'nested-test';
    const nestedDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: nestedDir,
      failOnMissingBaseline: false,
    });
    await nestedDiff.setup();

    await nestedDiff.assertMatchesBaseline('some-story', {
      snapshotName,
      viewport: 'desktop',
    });

    expect(fs.existsSync(path.join(nestedDir, `${snapshotName}.png`))).toBe(true);
    await nestedDiff.teardown();
  });
});
