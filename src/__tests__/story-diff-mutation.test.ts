import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StoryDiff } from '../story-diff.js';

const mocks = vi.hoisted(() => ({
  captureStoryMock: vi.fn(),
  playwrightExpectMock: vi.fn(),
}));

vi.mock('../browser.js', () => ({
  launchBrowser: vi.fn().mockResolvedValue({
    newPage: vi.fn(),
    close: vi.fn(),
  }),
  createPage: vi.fn().mockResolvedValue({
    setViewport: vi.fn(),
    goto: vi.fn(),
    getUnderlyingObject: vi.fn().mockReturnValue({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('native-screenshot')),
    }),
  }),
  closeBrowser: vi.fn(),
}));

vi.mock('../capture.js', () => ({
  captureStory: mocks.captureStoryMock,
}));

vi.mock('../storybook.js', () => ({
  waitForStorybookReady: vi.fn(),
  buildStoryUrl: vi.fn().mockReturnValue('http://localhost:6006/iframe.html?id=some-story'),
}));

vi.mock('../compare.js', () => ({
  compareImages: vi.fn().mockReturnValue({
    match: true,
    diffPixels: 0,
    diffPercentage: 0,
    diffImage: null,
  }),
}));

vi.mock('@playwright/test', () => ({
  expect: mocks.playwrightExpectMock,
  test: {
    info: vi.fn().mockImplementation(() => {
      throw new Error('No test info');
    }),
  },
}));

describe('StoryDiff - Mutation Coverage (Isolated)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-mut-iso-'));
    mocks.captureStoryMock.mockResolvedValue(Buffer.from('mock-png'));
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockResolvedValue(undefined)
    });
  });

  afterEach(async () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('DEFAULT_VIEWPORTS mobile has correct dimensions', async () => {
    const diff = new StoryDiff({ storybookUrl: 'http://localhost', snapshotsDir: tempDir });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'mobile' });
    expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 393, height: 852 });
    await diff.teardown();
  });

  it('buildSnapshotName slice uses correct negative unary - (not +)', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();
    const result = await diff.runAll([{
      componentName: 'Button',
      storyPath: 'components-button',
      stories: ['primary-button'],
      viewports: ['desktop'],
    }]);
    expect(result[0]?.snapshotName).toBe('button-primary-desktop');
    await diff.teardown();
  });

  it('runAll uses desktop as default viewport when test.viewports is undefined', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();
    const result = await diff.runAll([{
      componentName: 'Card',
      storyPath: 'card',
      stories: ['default'],
    }]);
    expect(result[0]?.viewport).toBe('desktop');
    await diff.teardown();
  });

  it('compareWithBaseline returns match=false with baselineMissing=true on missing baseline', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: true,
    });
    await diff.setup();
    const result = await diff.compareWithBaseline(Buffer.from('x'), 'never-exists');
    expect(result.match).toBe(false);
    expect(result.baselineMissing).toBe(true);
    await diff.teardown();
  });

  it('assertNativePlaywrightSnapshot baselineMissing=false on success', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    const result = await diff.assertMatchesBaseline('some-story', { snapshotName: 'base-mut' });
    expect(result.baselineMissing).toBe(false);
    await diff.teardown();
  });

  it('regex pattern matches "writing actual"', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('writing actual output')),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'regex-test' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('regex pattern matches "no snapshot"', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('no snapshot found')),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'no-snap' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('regex pattern matches "snapshot not found"', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('snapshot was not found')),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'snap-not-found' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('regex pattern matches "missing baseline"', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('missing baseline image')),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'miss-base' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('errorMessage uses error.message fallback', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    // Test that String(error) fallback works by using an error that isn't a real Error object 
    // but its toString() matches the regex
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue("writing actual"),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'string-err' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });
});
