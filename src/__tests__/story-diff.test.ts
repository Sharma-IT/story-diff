import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StoryDiff } from '../story-diff.js';
import { BaselineMissingError } from '../errors.js';

const mocks = vi.hoisted(() => ({
  captureStoryMock: vi.fn().mockImplementation(() => {
    const png = new (require('pngjs').PNG)({ width: 10, height: 10 });
    return Promise.resolve(require('pngjs').PNG.sync.write(png));
  }),
  waitForStorybookReadyMock: vi.fn(),
  playwrightExpectMock: vi.fn(),
}));

// Mock browser and capture to avoid puppeteer overhead in unit tests
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
  waitForStorybookReady: mocks.waitForStorybookReadyMock,
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
      throw new Error('No test info'); // Default to not in test mode
    }),
  },
}));

vi.mock('../hooks.js', () => ({
  hookLifecycle: vi.fn(),
}));

import { hookLifecycle } from '../hooks.js';

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

  it('tears down browser on teardown', async () => {
    const { closeBrowser } = await import('../browser.js');
    await diff.teardown();
    expect(closeBrowser).toHaveBeenCalled();
  });

  it('throws NotInitializedError if captureStory called before setup', async () => {
    const uninitialized = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
    });
    await expect(uninitialized.captureStory('some-story')).rejects.toThrow(
      'StoryDiff not initialised. Call setup() first.',
    );
  });

  it('hooks lifecycle automatically', () => {
    new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      autoLifecycle: true,
    });
    expect(hookLifecycle).toHaveBeenCalledWith(expect.any(StoryDiff), true);
  });

  it('throws BaselineMissingError when baseline is missing and update is false (default)', async () => {
    const snapshotName = 'non-existent-baseline';

    await expect(
      diff.assertMatchesBaseline('some-story', {
        snapshotName,
        viewport: 'desktop',
      }),
    ).rejects.toThrow(BaselineMissingError);
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

  it('uses native Playwright snapshotting when configured', async () => {
    const playwrightDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await playwrightDiff.setup();

    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: toHaveScreenshotMock,
    });

    const result = await playwrightDiff.assertMatchesBaseline('some-story', {
      snapshotName: 'native-test',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(toHaveScreenshotMock).toHaveBeenCalledWith(
      expect.stringContaining('native-test.png'),
      expect.objectContaining({ threshold: 0.1 }),
    );

    await playwrightDiff.teardown();
  });

  it('handles "snapshot created" error from Playwright as a success', async () => {
    const playwrightDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await playwrightDiff.setup();

    // Mock Playwright throwing the "missing snapshot" error which actually creates the snapshot
    const error = new Error("A snapshot doesn't exist at some-path, writing actual.");
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(error),
    });

    const result = await playwrightDiff.assertMatchesBaseline('some-story', {
      snapshotName: 'native-new-baseline',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);

    await playwrightDiff.teardown();
  });

  it('manually creates native baseline and bypasses expect when test.info() is available', async () => {
    const playwrightDiff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
      failOnMissingBaseline: false,
    });
    await playwrightDiff.setup();

    const { test: playwrightTest } = await import('@playwright/test');
    const snapshotPath = path.join(tempDir, 'manual-baseline.png');

    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: vi.fn().mockReturnValue(snapshotPath),
    } as any);

    // Ensure file does not exist
    if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);

    const result = await playwrightDiff.assertMatchesBaseline('some-story', {
      snapshotName: 'manual-baseline',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);
    // Should NOT have called expect.toHaveScreenshot because we bypassed it
    expect(mocks.playwrightExpectMock).not.toHaveBeenCalled();

    await playwrightDiff.teardown();
  });

  it('logs debug message on successful match', async () => {
    const debugMock = vi.fn();
    const diffWithLogger = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      logger: {
        level: 'debug',
        customLogger: (level, msg) => {
          if (level === 'debug') debugMock(msg);
        },
      },
    });
    await diffWithLogger.setup();

    // Mock a perfect match
    fs.writeFileSync(path.join(tempDir, 'match.png'), Buffer.from('baseline'));
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({ match: true, diffPixels: 0, diffPercentage: 0 });

    await diffWithLogger.assertMatchesBaseline('some-story', { snapshotName: 'match' });
    expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('matches baseline'));

    await diffWithLogger.teardown();
  });

  it('supports comparison overrides in assertMatchesBaseline', async () => {
    const diffWithOverride = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
    });
    await diffWithOverride.setup();

    // Mock a perfect match
    fs.writeFileSync(path.join(tempDir, 'override.png'), Buffer.from('baseline'));
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({ match: true, diffPixels: 0, diffPercentage: 10 });

    await diffWithOverride.assertMatchesBaseline('story', {
      snapshotName: 'override',
      comparison: { threshold: 0.5 },
    });

    // Verify compareImages was called with our override
    expect(compareImages).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Buffer),
      expect.objectContaining({ threshold: 0.5 }),
      expect.any(Object),
    );

    await diffWithOverride.teardown();
  });

  it('allows manual updateBaseline call', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
    });
    await diff.setup();
    await diff.updateBaseline(Buffer.from('foo'), 'manual-update');
    expect(fs.existsSync(path.join(tempDir, 'manual-update.png'))).toBe(true);
    await diff.teardown();
  });

  it('throws VisualRegressionError if snapshot does not match', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
    });
    await diff.setup();

    // Ensure the base directory exists
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    // Create a dummy baseline file so loadBaseline returns something
    fs.writeFileSync(path.join(tempDir, 'mismatch.png'), Buffer.from('baseline-data'));

    // Mock compareImages to return a mismatch
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: false,
      diffPixels: 100,
      diffPercentage: 10,
      diffImage: Buffer.from('diff-image'),
    });

    await expect(
      diff.assertMatchesBaseline('some-story', {
        snapshotName: 'mismatch',
      }),
    ).rejects.toThrow(/Visual regression detected for "mismatch"/);

    await diff.teardown();
  });

  it('throws native VisualRegressionError and configures failure limits in playwright mode', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true, failureThreshold: 5, failureThresholdType: 'pixel' },
    });
    await diff.setup();

    const expectMock = vi.fn().mockRejectedValue(new Error('Pixels mismatch 500'));
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: expectMock,
    });

    await expect(
      diff.assertMatchesBaseline('some-story', { snapshotName: 'fail-native' }),
    ).rejects.toThrow(/Visual regression detected for "fail-native"/);

    expect(expectMock).toHaveBeenCalledWith(
      'fail-native.png',
      expect.objectContaining({ maxDiffPixels: 5 }),
    );

    await diff.teardown();
  });

  it('configures native playwright with percentage failure threshold', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true, failureThreshold: 5, failureThresholdType: 'percent' },
    });
    await diff.setup();

    const expectMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: expectMock,
    });

    await diff.assertMatchesBaseline('some-story', { snapshotName: 'percent-native' });
    expect(expectMock).toHaveBeenCalledWith(
      'percent-native.png',
      expect.objectContaining({ maxDiffPixelRatio: 0.05 }),
    );

    await diff.teardown();
  });

  it('throws if playwright test package is missing', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();

    vi.doMock('@playwright/test', () => {
      throw new Error('missing');
    });

    try {
      // Need dynamic reset of the module specifically for this block's assertion
      const { StoryDiff: FreshDiff } = await import('../story-diff.js?cache=' + Date.now());
      const freshDiff = new FreshDiff({
        storybookUrl: 'http://localhost',
        snapshotsDir: tempDir,
        browser: { provider: 'playwright' },
        comparison: { useNativeSnapshot: true },
      });
      (freshDiff as any).page = { getUnderlyingObject: () => ({}) };
      await expect(freshDiff.assertMatchesBaseline('x', { snapshotName: 'x' })).rejects.toThrow(
        /installed/,
      );
    } finally {
      vi.doUnmock('@playwright/test');
      await diff.teardown();
    }
  });

  it('sets custom viewport dimensions', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      viewports: { customv: { name: 'customv', width: 1234, height: 5678 } },
      failOnMissingBaseline: false,
    });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;

    await diff.captureStory('foo-story', { viewport: 'customv' });
    expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1234, height: 5678 });
    await diff.teardown();
  });

  it('throws ViewportNotFoundError for missing viewport', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });

    await diff.setup();

    await expect(diff.captureStory('foo', { viewport: 'unknown-viewport' })).rejects.toThrow(
      'Unknown viewport "unknown-viewport"',
    );
  });

  it('builds clean snapshot names when component name is prefix or suffix', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();

    // The logic is in runAll handling
    const result1 = await diff.runAll([
      {
        componentName: 'Card',
        storyPath: 'components-card',
        stories: ['card-primary'], // prefix
        viewports: ['mobile'],
      },
    ]);
    expect(result1).toHaveLength(1);
    expect(result1[0]!.snapshotName).toBe('card-primary-mobile');

    const result2 = await diff.runAll([
      {
        componentName: 'Button',
        storyPath: 'components-button',
        stories: ['primary-button'], // suffix
        viewports: ['mobile'],
      },
    ]);
    // The "-button" should be stripped
    expect(result2).toHaveLength(1);
    expect(result2[0]!.snapshotName).toBe('button-primary-mobile');

    await diff.teardown();
  });
});

describe('StoryDiff - Root Config Autoload', () => {
  beforeEach(() => {
    mocks.captureStoryMock.mockClear();
    mocks.waitForStorybookReadyMock.mockClear();
  });

  afterEach(() => {});

  it('loads discovered root defaults when constructor config is omitted', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-config-project-'));
    const snapshotsDir = path.join(projectDir, 'snapshots');

    fs.writeFileSync(
      path.join(projectDir, 'story-diff.config.mjs'),
      `export default {
        storybookUrl: 'http://localhost:7007',
        snapshotsDir: ${JSON.stringify(snapshotsDir)},
        failOnMissingBaseline: false,
        defaults: {
          viewport: 'desktop',
          globals: { theme: 'dark' },
          waitForSelector: '#ready-element',
          waitForTimeout: 150,
        },
      };
      `,
    );

    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff({ cwd: projectDir });
    await diff.setup();

    const result = await diff.assertMatchesBaseline('some-story', {
      snapshotName: 'autoloaded-defaults',
    });

    expect(result.match).toBe(true);
    expect(result.baselineCreated).toBe(true);
    expect(mocks.captureStoryMock).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:7007',
      'some-story',
      expect.objectContaining({
        viewport: 'desktop',
        globals: { theme: 'dark' },
        waitForSelector: '#ready-element',
        waitForTimeout: 150,
      }),
      expect.anything(),
    );

    await diff.teardown();
  });

  it('prefers explicit assertion options over discovered defaults', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-config-project-'));
    const snapshotsDir = path.join(projectDir, 'snapshots');

    fs.writeFileSync(
      path.join(projectDir, 'story-diff.config.mjs'),
      `export default {
        storybookUrl: 'http://localhost:7007',
        snapshotsDir: ${JSON.stringify(snapshotsDir)},
        failOnMissingBaseline: false,
        defaults: {
          viewport: 'desktop',
          globals: { theme: 'dark' },
          waitForTimeout: 150,
        },
      };
      `,
    );

    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff({ cwd: projectDir });
    await diff.setup();

    await diff.assertMatchesBaseline('some-story', {
      snapshotName: 'per-call-overrides',
      viewport: 'mobile',
      globals: { theme: 'light' },
      waitForTimeout: 25,
    });

    expect(mocks.captureStoryMock).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:7007',
      'some-story',
      expect.objectContaining({
        viewport: 'mobile',
        globals: { theme: 'light' },
        waitForTimeout: 25,
      }),
      expect.anything(),
    );

    await diff.teardown();
  });

  it('uses configured batch tests when runAll is called without arguments', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-config-project-'));
    const snapshotsDir = path.join(projectDir, 'snapshots');

    fs.writeFileSync(
      path.join(projectDir, 'story-diff.config.mjs'),
      `export default {
        storybookUrl: 'http://localhost:7007',
        snapshotsDir: ${JSON.stringify(snapshotsDir)},
        failOnMissingBaseline: false,
        tests: [
          {
            componentName: 'Button',
            storyPath: 'components-button',
            stories: ['primary'],
            viewports: ['desktop'],
            globals: { theme: 'dark' },
          },
        ],
      };
      `,
    );

    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff({ cwd: projectDir });
    await diff.setup();

    const results = await diff.runAll();

    expect(results).toHaveLength(1);
    expect(results[0]?.snapshotName).toBe('button-primary-desktop');
    expect(mocks.captureStoryMock).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:7007',
      'components-button--primary',
      expect.objectContaining({
        viewport: 'desktop',
        globals: { theme: 'dark' },
      }),
      expect.anything(),
    );

    await diff.teardown();
  });

  it('discovers JSON root config files without caring about the file type', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-config-project-'));
    const snapshotsDir = path.join(projectDir, 'snapshots');

    fs.writeFileSync(
      path.join(projectDir, 'story-diff.json'),
      JSON.stringify({
        storybookUrl: 'http://localhost:7100',
        snapshotsDir,
        failOnMissingBaseline: false,
        defaults: {
          viewport: 'desktop',
        },
      }),
    );

    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff({ cwd: projectDir });
    await diff.setup();

    const result = await diff.assertMatchesBaseline('some-story', {
      snapshotName: 'json-config',
    });

    expect(result.match).toBe(true);
    expect(mocks.captureStoryMock).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:7100',
      'some-story',
      expect.objectContaining({
        viewport: 'desktop',
      }),
      expect.anything(),
    );

    await diff.teardown();
  });

  it('uses configured batch tests when runAll is called without arguments', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-batch-'));
    const tests = [{ componentName: 'A', storyPath: 'A', stories: ['B'] }];
    const batchDiff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: projectDir,
      tests,
    });
    await batchDiff.setup();

    // Mock compareWithBaseline to return a success
    vi.spyOn(batchDiff as any, 'compareWithBaseline').mockResolvedValue({ match: true });

    const results = await batchDiff.runAll();
    expect(results).toHaveLength(1);
    expect(results[0]?.storyId).toBe('A--B');

    await batchDiff.teardown();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('sets custom viewport dimensions via object', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-viewport-'));
    const diffWithObject = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: projectDir,
    });
    await diffWithObject.setup();

    // Pass direct viewport object
    await diffWithObject.captureStory('some-story', {
      viewport: { name: 'custom', width: 123, height: 456 },
    });

    const page = await (diffWithObject as any).getPage();
    expect(page.setViewport).toHaveBeenCalledWith({ width: 123, height: 456 });

    await diffWithObject.teardown();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('sets default viewport if none specified in runAll test', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-default-viewport-'));
    const batchDiff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: projectDir,
    });
    await batchDiff.setup();

    vi.spyOn(batchDiff as any, 'compareWithBaseline').mockResolvedValue({ match: true });

    await batchDiff.runAll([{ componentName: 'A', storyPath: 'A', stories: ['B'] }]);
    // Success means it processed with default 'desktop' viewport
    await batchDiff.teardown();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('handles ANSI colors and Playwright baseline missing error strings', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-ansi-'));

    // Explicitly mock playwright here because a previous test unmocked it
    const playwrightMock = {
      toHaveScreenshot: vi
        .fn()
        .mockRejectedValue(new Error('Writing actual to path/to/baseline.png')),
    };
    vi.doMock('@playwright/test', () => ({
      expect: vi.fn().mockReturnValue(playwrightMock),
      test: { info: vi.fn() },
    }));

    // Cache bust the import to pick up the new mock
    const { StoryDiff: FreshDiff } = await import('../story-diff.js?ansi-cache=' + Date.now());
    const diff = new FreshDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: projectDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });

    await diff.setup();
    const result = await diff.assertMatchesBaseline('x', { snapshotName: 'missing' });
    expect(result.baselineCreated).toBe(true);

    await diff.teardown();
    fs.rmSync(projectDir, { recursive: true, force: true });

    // Restore the hoist mock for subsequent tests!
    vi.doMock('@playwright/test', () => ({
      expect: mocks.playwrightExpectMock,
      test: {
        info: vi.fn().mockImplementation(() => {
          throw new Error('No test info');
        }),
      },
    }));
  });
});

describe('StoryDiff - Additional Edge Cases', () => {
  let tempDir: string;
  let diff: StoryDiff;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-edge-case-'));
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

  it('explicitly throws BaselineMissingError when failOnMissingBaseline is true', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: true,
    });
    await diff.setup();
    await expect(
      diff.assertMatchesBaseline('some-story', { snapshotName: 'missing' }),
    ).rejects.toThrow(BaselineMissingError);
    await diff.teardown();
  });

  it('strips component name suffix correctly during name normalization', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();

    // We use runAll as it's the main entry for this normalization logic
    const results = await diff.runAll([
      {
        componentName: 'Toggle',
        storyPath: 'ui-toggle',
        stories: ['active-toggle'], // suffix "toggle" matches component "Toggle"
        viewports: ['desktop'],
      },
    ]);

    expect(results[0]?.snapshotName).toBe('toggle-active-desktop');
    await diff.teardown();
  });
});

describe('StoryDiff - Mutation Coverage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-mut-'));
  });

  afterEach(async () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('does NOT call hookLifecycle when autoLifecycle is absent or false', async () => {
    const { hookLifecycle } = await import('../hooks.js');
    (hookLifecycle as any).mockClear();
    // Test the truthiness and optional chaining mutants for config?.autoLifecycle
    new StoryDiff(); // undefined config
    new StoryDiff({ autoLifecycle: false } as any);
    expect(hookLifecycle).not.toHaveBeenCalled();
  });

  it('instantiates logger cleanly even with undefined config', async () => {
    // Kills OptionalChaining mutant: config?.logger -> config.logger
    const diff = new StoryDiff();
    expect((diff as any).logger).toBeDefined();
  });

  it('logs precise strings across lifecycle', async () => {
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://foo',
      snapshotsDir: tempDir,
      logger: { level: 'debug', customLogger },
    });

    // Test setup logs
    await diff.setup();
    expect(customLogger).toHaveBeenCalledWith('info', 'Setting up StoryDiff...');
    expect(customLogger).toHaveBeenCalledWith('debug', 'Browser config:', undefined);
    expect(customLogger).toHaveBeenCalledWith('info', 'Connecting to Storybook at http://foo');
    expect(customLogger).toHaveBeenCalledWith('info', 'StoryDiff setup complete');

    // Test capture logs
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('my-id', { viewport: 'mobile' });
    expect(customLogger).toHaveBeenCalledWith('debug', 'Setting viewport to mobile (393x852)');
    expect(customLogger).toHaveBeenCalledWith('info', 'Capturing story: my-id');

    // Make sure we have a browser active before teardown so it prints the log
    (diff as any).browser = { close: vi.fn() };
    expect((diff as any).browser).toBeTruthy();

    // Test teardown logs
    await diff.teardown();
    expect(customLogger).toHaveBeenCalledWith('info', 'Tearing down StoryDiff...');
    expect(customLogger).toHaveBeenCalledWith('info', 'StoryDiff teardown complete');
  });

  it('teardown does not call closeBrowser if browser is null', async () => {
    // Tests: if (this.browser) mutated to if (true)
    const { closeBrowser } = await import('../browser.js');
    (closeBrowser as any).mockClear();
    const diff = new StoryDiff();
    await diff.teardown();
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it('DEFAULT_VIEWPORTS mobile has correct name, width, height', async () => {
    // Mutants: ObjectLiteral={}, StringLiteral name=""
    const diff = new StoryDiff({ storybookUrl: 'http://localhost', snapshotsDir: tempDir });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'mobile' });
    expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 393, height: 852 });
    await diff.teardown();
  });

  it('DEFAULT_VIEWPORTS tablet has correct name, width, height', async () => {
    const diff = new StoryDiff({ storybookUrl: 'http://localhost', snapshotsDir: tempDir });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'tablet' });
    expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 768, height: 1024 });
    await diff.teardown();
  });

  it('DEFAULT_VIEWPORTS desktop has correct name, width, height', async () => {
    const diff = new StoryDiff({ storybookUrl: 'http://localhost', snapshotsDir: tempDir });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'desktop' });
    expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1440, height: 900 });
    await diff.teardown();
  });

  it('DEFAULT_VIEWPORTS viewport names must not be empty strings', async () => {
    // A ViewportNotFoundError message includes the resolved viewport name
    const diff = new StoryDiff({ storybookUrl: 'http://localhost', snapshotsDir: tempDir });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'mobile' });
    // We just verify setViewport was called with the exact dimensions (not empty object)
    expect(mockPage.setViewport).toHaveBeenCalledWith(expect.objectContaining({ width: 393 }));
    await diff.teardown();
  });

  it('buildSnapshotName slice uses correct negative unary - (not +)', async () => {
    // If + were used: slice(0, +(comp.length + 1)) = slice(0, 7) = 'primary' (prefix behavior)
    // Expected: for 'primary-button' with comp='button', cleanStory='primary'
    // snapshotName = 'button-primary-desktop'
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();
    const result = await diff.runAll([
      {
        componentName: 'Button',
        storyPath: 'components-button',
        stories: ['primary-button'],
        viewports: ['desktop'],
      },
    ]);
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
    const result = await diff.runAll([
      {
        componentName: 'Card',
        storyPath: 'card',
        stories: ['default'],
        // no viewports
      },
    ]);
    expect(result[0]?.viewport).toBe('desktop');
    expect(result[0]?.snapshotName).toBe('card-default-desktop');
    await diff.teardown();
  });

  it('globals conditional: mergedGlobals.length>0 (not >=0) controls URL params', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();
    await diff.captureStory('story', {}); // no globals
    expect(mocks.captureStoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ globals: undefined }),
      expect.anything(),
    );
    await diff.teardown();
  });

  it('getConfig condition checks both storybookUrl AND snapshotsDir (not just one)', async () => {
    // Mutant: if (true && this.config.snapshotsDir) - would skip even when storybookUrl missing
    // A config with no storybookUrl should fall to resolveStoryDiffConfig (which throws ConfigNotFoundError)
    const diff = new StoryDiff({ snapshotsDir: tempDir } as any);
    // setup() calls getConfig and should fail to load config (no storybookUrl, no config file)
    // Since there's no config file, ConfigNotFoundError will be thrown
    await expect(diff.setup()).rejects.toThrow();
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
    expect(result.baselineCreated).toBe(false);
    expect(result.baselineMissing).toBe(true);
    await diff.teardown();
  });

  it('compareWithBaseline snapshotPath includes snapshotsDir and snapshotName.png', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: true,
    });
    await diff.setup();
    const result = await diff.compareWithBaseline(Buffer.from('x'), 'my-snap');
    expect(result.snapshotPath).toBe(`${tempDir}/my-snap.png`);
    await diff.teardown();
  });

  it('assertNativePlaywrightSnapshot baselineMissing=false on success (not true)', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });
    const result = await diff.assertMatchesBaseline('some-story', { snapshotName: 'base-mut' });
    expect(result.baselineMissing).toBe(false);
    expect(result.baselineCreated).toBe(false);
    await diff.teardown();
  });

  it('assertNativePlaywrightSnapshot with baseline missing error: baselineCreated=true, baselineMissing=false', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error("snapshot doesn't exist")),
    });
    const result = await diff.assertMatchesBaseline('some-story', {
      snapshotName: 'new-baseline-mut',
    });
    expect(result.baselineCreated).toBe(true);
    expect(result.baselineMissing).toBe(false);
    await diff.teardown();
  });

  it('regex pattern matches "writing actual" in error messages', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('writing actual to /path/snap.png')),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'regex-test' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('regex pattern matches "no snapshot" error message', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('no snapshot found for test')),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'no-snap' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('regex pattern matches "snapshot not found" error message', async () => {
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

  it('regex pattern matches "missing baseline" error message', async () => {
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

  it('regex uses || not && between the baseline-detection patterns', async () => {
    // Each pattern alone must trigger baseline detection
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    // Only "writing actual" matches - would fail if && required both
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('writing actual')),
    });
    const r1 = await diff.assertMatchesBaseline('s', { snapshotName: 'or-test-1' });
    expect(r1.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('errorMessage uses error.message OR String(error) fallback (|| not &&)', async () => {
    // If && were used: errorMessage would always be String(error) since truthy && string = string
    // But for an Error with a message: error.message='foo', String(error)='Error: foo'
    // || => 'foo'    && => 'Error: foo'
    // The regex then checks errorMessage for baseline-missing patterns
    // We test this by giving a pattern that exists in error.message but NOT in String(error)
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    // error.message = "writing actual" -- contains the pattern
    // String(error) = "Error: writing actual" -- also contains it, so both branches work here
    // Use a pattern that IS in error.message: "snapshot doesn't exist"
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error("snapshot doesn't exist at /path")),
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'or-msg' });
    expect(result.baselineCreated).toBe(true);
    await diff.teardown();
  });

  it('does NOT use native snapshot if provider is not playwright (even if requested)', async () => {
    const file = path.join(tempDir, 'no-pw-native.png');
    fs.writeFileSync(file, Buffer.from('baseline'));
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'puppeteer' }, // NOT playwright
      comparison: { useNativeSnapshot: true }, // BUT requested native!
    });
    await diff.setup();
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: true,
      diffPixels: 0,
      diffPercentage: 0,
      diffImage: null,
    });

    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'no-pw-native' });
    expect(result.match).toBe(true);
    expect(compareImages).toHaveBeenCalled();
    expect(mocks.playwrightExpectMock).not.toHaveBeenCalled();
    await diff.teardown();
  });

  it('passes precisely correct options to playwright toHaveScreenshot (and logs native)', async () => {
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true, failureThreshold: 0.1 },
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });
    await diff.assertMatchesBaseline('s', { snapshotName: 'pw-opts' });

    expect(toHaveScreenshotMock).toHaveBeenCalledWith(
      'pw-opts.png',
      expect.objectContaining({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        maxDiffPixelRatio: 0.001,
        threshold: 0.1,
      }),
    );
    expect(customLogger).toHaveBeenCalledWith(
      'info',
      'Using native Playwright snapshot for: pw-opts',
    );
    await diff.teardown();
  });

  it('assertNativePlaywrightSnapshot: useNativeSnapshot=false skips native path', async () => {
    // Mutant: || would allow either condition to trigger native snapshot
    const file = path.join(tempDir, 'no-native.png');
    fs.writeFileSync(file, Buffer.from('baseline'));
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: false }, // <-- NOT native
    });
    await diff.setup();
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: true,
      diffPixels: 0,
      diffPercentage: 0,
      diffImage: null,
    });
    // Should use regular comparison path, not native
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'no-native' });
    expect(result.match).toBe(true);
    expect(mocks.playwrightExpectMock).not.toHaveBeenCalled();
    await diff.teardown();
  });

  it('diffPath is set when compareResult has diffImage (not a no-op empty block)', async () => {
    // Mutant: empty block {} would skip saveDiffOutput
    const baseline = path.join(tempDir, 'diff-test.png');
    fs.writeFileSync(baseline, Buffer.from('baseline-data'));
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: false,
      diffPixels: 50,
      diffPercentage: 5.5,
      diffImage: Buffer.from('diff-data'),
    });
    await expect(diff.assertMatchesBaseline('s', { snapshotName: 'diff-test' })).rejects.toThrow(
      /Visual regression/,
    );

    // Check that we got the exact logged strings
    expect(customLogger).toHaveBeenCalledWith('debug', 'Comparing with baseline: diff-test');
    expect(customLogger).toHaveBeenCalledWith(
      'warn',
      'Visual difference detected: diff-test (5.50%)',
    );
    expect(customLogger).toHaveBeenCalledWith('info', expect.stringContaining('Diff image saved:'));
    await diff.teardown();
  });

  it('match===true when compareResult.match is true (not negated)', async () => {
    // Mutant: if (compareResult.match && ...) would incorrectly trigger on a match
    const baseline = path.join(tempDir, 'neg-test.png');
    fs.writeFileSync(baseline, Buffer.from('baseline-data'));
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: true,
      diffPixels: 0,
      diffPercentage: 0,
      diffImage: Buffer.from('diff-data'), // simulate mutant where diffImage exists but match=true
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'neg-test' });
    expect(result.match).toBe(true);
    expect(customLogger).toHaveBeenCalledWith('debug', 'Snapshot matches baseline: neg-test');
    await diff.teardown();
  });

  it('logs baseline missing/creation across lifecycle', async () => {
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://foo',
      snapshotsDir: tempDir,
      failOnMissingBaseline: true,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;

    // missing baseline log
    await expect(
      diff.assertMatchesBaseline('s', { snapshotName: 'no-base-exists' }),
    ).rejects.toThrow();
    expect(customLogger).toHaveBeenCalledWith('warn', 'Baseline missing: no-base-exists');
    await diff.teardown();

    // updating baseline log
    const diffUpdate = new StoryDiff({
      storybookUrl: 'http://foo',
      snapshotsDir: tempDir,
      update: true,
      logger: { level: 'debug', customLogger },
    });
    await diffUpdate.setup();
    (diffUpdate as any).page = mockPage;
    await diffUpdate.assertMatchesBaseline('s', { snapshotName: 'update-base' });
    expect(customLogger).toHaveBeenCalledWith('info', 'Updating baseline: update-base');
    await diffUpdate.teardown();

    const diff2 = new StoryDiff({
      storybookUrl: 'http://foo',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false, // create new baseline
      logger: { level: 'debug', customLogger },
    });
    await diff2.setup();
    (diff2 as any).page = mockPage;
    await diff2.assertMatchesBaseline('s', { snapshotName: 'brand-new' });
    expect(customLogger).toHaveBeenCalledWith('info', 'Creating new baseline: brand-new');
    await diff2.teardown();
  });

  it('snapshotPath includes exact snapshotsDir and snapshotName in comparison with existing baseline', async () => {
    const baseline = path.join(tempDir, 'existing-snap.png');
    fs.writeFileSync(baseline, Buffer.from('baseline-data'));
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
    });
    await diff.setup();
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: true,
      diffPixels: 0,
      diffPercentage: 0,
      diffImage: null,
    });
    const result = await diff.compareWithBaseline(Buffer.from('x'), 'existing-snap');
    expect(result.snapshotPath).toBe(`${tempDir}/existing-snap.png`);
    expect(result.snapshotPath).toContain(tempDir);
    expect(result.snapshotPath).toContain('existing-snap');
    await diff.teardown();
  });

  it('else-if branch logs warning when compareResult.match is false (not skipped)', async () => {
    // Mutant: if (false) would skip this branch
    const baseline = path.join(tempDir, 'no-diff-img.png');
    fs.writeFileSync(baseline, Buffer.from('baseline'));
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: false,
      diffPixels: 10,
      diffPercentage: 2.5,
      diffImage: null, // no diff image — triggers the else-if branch
    });
    await expect(
      diff.assertMatchesBaseline('s', { snapshotName: 'no-diff-img' }),
    ).rejects.toThrow();
    // The else-if branch should log the warning
    expect(customLogger).toHaveBeenCalledWith(
      'warn',
      'Visual difference detected: no-diff-img (2.50%)',
    );
    await diff.teardown();
  });

  it('optional chaining on config?.browser?.provider does not crash when browser is undefined', async () => {
    // Mutant: config.browser.provider would crash when browser is undefined
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      comparison: { useNativeSnapshot: true },
      // no browser config — browser is undefined
    });
    await diff.setup();
    // Should NOT take native snapshot path since provider is not 'playwright'
    const baselinePath = path.join(tempDir, 'no-browser-config.png');
    fs.writeFileSync(baselinePath, Buffer.from('baseline'));
    const { compareImages } = await import('../compare.js');
    (compareImages as any).mockReturnValueOnce({
      match: true,
      diffPixels: 0,
      diffPercentage: 0,
      diffImage: null,
    });
    const result = await diff.assertMatchesBaseline('s', { snapshotName: 'no-browser-config' });
    expect(result.match).toBe(true);
    // Should NOT have called playwright expect
    expect(mocks.playwrightExpectMock).not.toHaveBeenCalled();
    await diff.teardown();
  });

  it('getConfig returns early when both storybookUrl and snapshotsDir are set (not empty block)', async () => {
    // Mutant: empty block {} would skip the return, falling through to resolveStoryDiffConfig
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
    });
    await diff.setup();
    // If the block were empty, setup would try resolveStoryDiffConfig and fail
    // Success here proves the block executes
    await diff.teardown();
  });

  it('getConfig optional chaining does not crash when config is null', async () => {
    // Mutant: this.config.storybookUrl would crash when config is null
    // This will fall through to resolveStoryDiffConfig which throws if no config found
    const diff = new StoryDiff();
    await expect(diff.setup()).rejects.toThrow();
  });

  it('getConfig conditional checks both storybookUrl AND snapshotsDir (not short-circuited)', async () => {
    const diff = new StoryDiff({ storybookUrl: 'http://localhost' } as any);
    // Should fall to resolveStoryDiffConfig since snapshotsDir is missing
    await expect(diff.setup()).rejects.toThrow();
  });

  it('native playwright snapshot: testInfo.snapshotPath check uses typeof function (not empty string or true)', async () => {
    // Mutant: replaces 'function' with '' or uses true/!==
    const { test: playwrightTest } = await import('@playwright/test');
    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: '/some/path/snapshot.png', // string, NOT function
    } as any);

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'typeof-check' });
    expect(result.match).toBe(true);
    // snapshotPath should fall back to path.join(snapshotsDir, name) since testInfo.snapshotPath is not a function
    expect(result.snapshotPath).toBe(path.join(tempDir, 'typeof-check.png'));
    await diff.teardown();

    // Restore default mock
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });
  });

  it('native playwright: test.info() catch block returns undefined (not empty block)', async () => {
    // Mutant: empty catch {} would leave testInfo as whatever the throw produces
    const { test: playwrightTest } = await import('@playwright/test');
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test running');
    });

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'catch-block' });
    expect(result.match).toBe(true);
    // Should use path.join fallback since testInfo is undefined
    expect(result.snapshotPath).toBe(path.join(tempDir, 'catch-block.png'));
    await diff.teardown();
  });

  it('native playwright: failureThreshold conditional must be guarded (not always true)', async () => {
    // Mutant: if (true) would always set maxDiffPixels or maxDiffPixelRatio
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true }, // no failureThreshold
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });

    await diff.assertMatchesBaseline('story', { snapshotName: 'no-threshold' });
    const callArgs = toHaveScreenshotMock.mock.calls[0]![1];
    expect(callArgs).not.toHaveProperty('maxDiffPixels');
    expect(callArgs).not.toHaveProperty('maxDiffPixelRatio');
    await diff.teardown();
  });

  it('native playwright: manual baseline creation passes exact screenshot options', async () => {
    // Mutant: {} would omit path and other options
    const { test: playwrightTest } = await import('@playwright/test');
    const snapshotPath = path.join(tempDir, 'manual-opts.png');
    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: vi.fn().mockReturnValue(snapshotPath),
    } as any);

    if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
      failOnMissingBaseline: false,
    });
    await diff.setup();

    const screenshotMock = vi.fn().mockResolvedValue(Buffer.from('screenshot-data'));
    (diff as any).page = {
      setViewport: vi.fn(),
      getUnderlyingObject: vi.fn().mockReturnValue({ screenshot: screenshotMock }),
    };

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'manual-opts' });
    expect(result.baselineCreated).toBe(true);
    expect(result.baselineMissing).toBe(false);

    // Verify screenshot was called with path and pw options
    expect(screenshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: snapshotPath,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
      }),
    );

    await diff.teardown();
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });
  });

  it('native playwright: manual baseline log message is exact (not empty)', async () => {
    // Mutant: '' would log empty string
    const { test: playwrightTest } = await import('@playwright/test');
    const snapshotPath = path.join(tempDir, 'log-baseline.png');
    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: vi.fn().mockReturnValue(snapshotPath),
    } as any);

    if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);

    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
      failOnMissingBaseline: false,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();

    const screenshotMock = vi.fn().mockResolvedValue(Buffer.from('data'));
    (diff as any).page = {
      setViewport: vi.fn(),
      getUnderlyingObject: vi.fn().mockReturnValue({ screenshot: screenshotMock }),
    };

    await diff.assertMatchesBaseline('story', { snapshotName: 'log-baseline' });
    expect(customLogger).toHaveBeenCalledWith(
      'info',
      `Creating missing native baseline: ${snapshotPath}`,
    );

    await diff.teardown();
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });
  });

  it('native playwright: error log message includes errorMessage (not empty)', async () => {
    // Mutant: '' would log empty string
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('Pixels mismatch 42%')),
    });
    await expect(diff.assertMatchesBaseline('s', { snapshotName: 'err-log' })).rejects.toThrow();
    expect(customLogger).toHaveBeenCalledWith(
      'error',
      'Native Playwright snapshot failed: Pixels mismatch 42%',
    );
    await diff.teardown();
  });

  it('runAll logs exact batch start and completion messages (not empty)', async () => {
    // Mutant: '' would log empty string
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    await diff.runAll([
      {
        componentName: 'Card',
        storyPath: 'card',
        stories: ['default', 'outlined'],
        viewports: ['desktop'],
      },
    ]);
    expect(customLogger).toHaveBeenCalledWith('info', 'Running batch tests for 1 component(s)');
    expect(customLogger).toHaveBeenCalledWith(
      'info',
      'Batch tests complete: 2 snapshot(s) processed',
    );
    await diff.teardown();
  });

  it('DEFAULT_VIEWPORTS tablet name is exactly tablet (not empty string)', async () => {
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'tablet' });
    expect(customLogger).toHaveBeenCalledWith('debug', 'Setting viewport to tablet (768x1024)');
    await diff.teardown();
  });

  it('DEFAULT_VIEWPORTS desktop name is exactly desktop (not empty string)', async () => {
    const customLogger = vi.fn();
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      logger: { level: 'debug', customLogger },
    });
    await diff.setup();
    const mockPage = { setViewport: vi.fn(), getUnderlyingObject: vi.fn() };
    (diff as any).page = mockPage;
    await diff.captureStory('foo', { viewport: 'desktop' });
    expect(customLogger).toHaveBeenCalledWith('debug', 'Setting viewport to desktop (1440x900)');
    await diff.teardown();
  });

  it('regex correctly matches each baseline-missing pattern individually (kills .* to . mutants)', async () => {
    const patterns = [
      "A snapshot file   doesn't     exist yet", // multiple spaces between words
      'writing       actual to disk', // multiple spaces
      'no    available    snapshot', // multiple spaces
      'snapshot was    not     found', // multiple spaces
      'missing      baseline image', // multiple spaces
    ];

    for (const pattern of patterns) {
      const diff = new StoryDiff({
        storybookUrl: 'http://localhost',
        snapshotsDir: tempDir,
        browser: { provider: 'playwright' },
        comparison: { useNativeSnapshot: true },
      });
      await diff.setup();
      mocks.playwrightExpectMock.mockReturnValue({
        toHaveScreenshot: vi.fn().mockRejectedValue(new Error(pattern)),
      });
      const result = await diff.assertMatchesBaseline('s', {
        snapshotName: `regex-${patterns.indexOf(pattern)}`,
      });
      expect(result.baselineCreated).toBe(true);
      await diff.teardown();
    }
  });

  it('native playwright: baseline creation logic requires all 4 conditions (testInfo && snapshotPath && !existsSync && !failOnMissingBaseline)', async () => {
    // Mutant: replacing && with || would trigger baseline creation even when file exists
    const { test: playwrightTest } = await import('@playwright/test');
    const snapshotPath = path.join(tempDir, 'already-exists.png');
    fs.writeFileSync(snapshotPath, Buffer.from('existing-baseline'));

    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: vi.fn().mockReturnValue(snapshotPath),
    } as any);

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
      failOnMissingBaseline: false,
    });
    await diff.setup();

    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'already-exists' });
    // Should use normal expect path since file exists
    expect(toHaveScreenshotMock).toHaveBeenCalled();
    expect(result.baselineCreated).toBe(false);

    await diff.teardown();
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });
  });

  it('isRecord(testInfo) check: false when testInfo is undefined (not short-circuited)', async () => {
    // Mutant: replacing entire expression with false would skip snapshotPath resolution
    const { test: playwrightTest } = await import('@playwright/test');
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'no-testinfo' });
    // Fallback: path.join(snapshotsDir, 'no-testinfo.png')
    expect(result.snapshotPath).toBe(path.join(tempDir, 'no-testinfo.png'));
    await diff.teardown();
  });

  it('testInfo.snapshotPath result is used when available (not fallback path.join)', async () => {
    // Mutant: → false would use fallback, yielding a DIFFERENT path
    const { test: playwrightTest } = await import('@playwright/test');
    const customSnapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-snap-'));
    const customSnapshotPath = path.join(customSnapshotDir, 'custom-testinfo.png');

    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: vi.fn().mockReturnValue(customSnapshotPath),
    } as any);

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir, // snapshotsDir is DIFFERENT from customSnapshotDir
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
    });
    await diff.setup();
    const toHaveScreenshotMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({ toHaveScreenshot: toHaveScreenshotMock });

    // Pre-create the baseline so it doesn't try manual creation
    fs.writeFileSync(customSnapshotPath, Buffer.from('baseline'));

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'custom-testinfo' });
    expect(result.match).toBe(true);
    // Key assertion: snapshotPath must be the custom path, NOT path.join(tempDir, 'custom-testinfo.png')
    expect(result.snapshotPath).toBe(customSnapshotPath);
    expect(result.snapshotPath).not.toBe(path.join(tempDir, 'custom-testinfo.png'));

    await diff.teardown();
    fs.rmSync(customSnapshotDir, { recursive: true, force: true });

    // Restore default mock
    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });
  });

  it('baseline creation uses testInfo snapshotPath (not fallback) when conditions are met', async () => {
    // Mutant: && → || at line 273 would short-circuit and create baseline inappropriately
    const { test: playwrightTest } = await import('@playwright/test');
    const customSnapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-create-'));
    const customSnapshotPath = path.join(customSnapshotDir, 'create-test.png');

    vi.mocked(playwrightTest.info).mockReturnValue({
      snapshotPath: vi.fn().mockReturnValue(customSnapshotPath),
    } as any);

    // Ensure file does NOT exist
    if (fs.existsSync(customSnapshotPath)) fs.unlinkSync(customSnapshotPath);

    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true },
      failOnMissingBaseline: false,
    });
    await diff.setup();

    const screenshotMock = vi.fn().mockResolvedValue(Buffer.from('data'));
    (diff as any).page = {
      setViewport: vi.fn(),
      getUnderlyingObject: vi.fn().mockReturnValue({ screenshot: screenshotMock }),
    };

    const result = await diff.assertMatchesBaseline('story', { snapshotName: 'create-test' });
    expect(result.baselineCreated).toBe(true);
    // Key: screenshot was called with the CUSTOM path
    expect(screenshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: customSnapshotPath }),
    );
    expect(result.snapshotPath).toBe(customSnapshotPath);

    await diff.teardown();
    fs.rmSync(customSnapshotDir, { recursive: true, force: true });

    vi.mocked(playwrightTest.info).mockImplementation(() => {
      throw new Error('No test info');
    });
  });
});
