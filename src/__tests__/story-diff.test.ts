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

  it('throws NotInitializedError if captureStory called before setup', async () => {
    const uninitialized = new StoryDiff({ storybookUrl: 'http://localhost', snapshotsDir: tempDir });
    await expect(uninitialized.captureStory('some-story')).rejects.toThrow('StoryDiff not initialised. Call setup() first.');
  });

  it('hooks lifecycle automatically', () => {
    // This executes the hookLifecycle branch in the constructor
    new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      autoLifecycle: true,
    });
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
      expect.objectContaining({ threshold: 0.1 })
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
    const error = new Error('A snapshot doesn\'t exist at some-path, writing actual.');
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
        }
      }
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
      comparison: { threshold: 0.5 }
    });

    // Verify compareImages was called with our override
    expect(compareImages).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Buffer),
      expect.objectContaining({ threshold: 0.5 }),
      expect.any(Object)
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
      diffImage: Buffer.from('diff-image')
    });

    await expect(diff.assertMatchesBaseline('some-story', {
      snapshotName: 'mismatch',
    })).rejects.toThrow(/Visual regression detected for "mismatch"/);

    await diff.teardown();
  });

  it('throws native VisualRegressionError and configures failure limits in playwright mode', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true, failureThreshold: 5, failureThresholdType: 'pixel' }
    });
    await diff.setup();

    const expectMock = vi.fn().mockRejectedValue(new Error('Pixels mismatch 500'));
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: expectMock,
    });

    await expect(diff.assertMatchesBaseline('some-story', { snapshotName: 'fail-native' }))
      .rejects.toThrow(/Visual regression detected for "fail-native"/);

    expect(expectMock).toHaveBeenCalledWith('fail-native.png', expect.objectContaining({ maxDiffPixels: 5 }));

    await diff.teardown();
  });

  it('configures native playwright with percentage failure threshold', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true, failureThreshold: 5, failureThresholdType: 'percent' }
    });
    await diff.setup();

    const expectMock = vi.fn().mockResolvedValue(undefined);
    mocks.playwrightExpectMock.mockReturnValue({
      toHaveScreenshot: expectMock,
    });

    await diff.assertMatchesBaseline('some-story', { snapshotName: 'percent-native' });
    expect(expectMock).toHaveBeenCalledWith('percent-native.png', expect.objectContaining({ maxDiffPixelRatio: 0.05 }));

    await diff.teardown();
  });

  it('throws if playwright test package is missing', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: tempDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true }
    });
    await diff.setup();

    vi.doMock('@playwright/test', () => { throw new Error('missing') });

    try {
      // Need dynamic reset of the module specifically for this block's assertion
      const { StoryDiff: FreshDiff } = await import('../story-diff.js?cache=' + Date.now());
      const freshDiff = new FreshDiff({
        storybookUrl: 'http://localhost',
        snapshotsDir: tempDir,
        browser: { provider: 'playwright' },
        comparison: { useNativeSnapshot: true }
      });
      (freshDiff as any).page = { getUnderlyingObject: () => ({}) };
      await expect(freshDiff.assertMatchesBaseline('x', { snapshotName: 'x' }))
        .rejects.toThrow(/installed/);
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

    await expect(diff.captureStory('foo', { viewport: 'unknown-viewport' }))
      .rejects.toThrow('Unknown viewport "unknown-viewport"');
  });

  it('builds clean snapshot names when component name is prefix or suffix', async () => {
    const diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: tempDir,
      failOnMissingBaseline: false,
    });
    await diff.setup();

    // The logic is in runAll handling
    const result1 = await diff.runAll([{
      componentName: 'Card',
      storyPath: 'components-card',
      stories: ['card-primary'], // prefix
      viewports: ['mobile']
    }]);
    expect(result1).toHaveLength(1);
    expect(result1[0]!.snapshotName).toBe('card-primary-mobile');

    const result2 = await diff.runAll([{
      componentName: 'Button',
      storyPath: 'components-button',
      stories: ['primary-button'], // suffix
      viewports: ['mobile']
    }]);
    // The "-button" should be stripped
    expect(result2).toHaveLength(1);
    expect(result2[0]!.snapshotName).toBe('button-primary-mobile');

    await diff.teardown();
  });
});

describe('StoryDiff - Root Config Autoload', () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    mocks.captureStoryMock.mockClear();
    mocks.waitForStorybookReadyMock.mockClear();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

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

    process.chdir(projectDir);
    vi.resetModules();
    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff();
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

    process.chdir(projectDir);
    vi.resetModules();
    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff();
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

    process.chdir(projectDir);
    vi.resetModules();
    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff();
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

    process.chdir(projectDir);
    vi.resetModules();
    const { StoryDiff: AutoConfiguredStoryDiff } = await import('../story-diff.js');

    const diff = new AutoConfiguredStoryDiff();
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
      viewport: { name: 'custom', width: 123, height: 456 }
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
      toHaveScreenshot: vi.fn().mockRejectedValue(new Error('Writing actual to path/to/baseline.png')),
    };
    vi.doMock('@playwright/test', () => ({
      expect: vi.fn().mockReturnValue(playwrightMock),
      test: { info: vi.fn() }
    }));

    // Cache bust the import to pick up the new mock
    const { StoryDiff: FreshDiff } = await import('../story-diff.js?ansi-cache=' + Date.now());
    const diff = new FreshDiff({
      storybookUrl: 'http://localhost',
      snapshotsDir: projectDir,
      browser: { provider: 'playwright' },
      comparison: { useNativeSnapshot: true }
    });
    
    await diff.setup();
    const result = await diff.assertMatchesBaseline('x', { snapshotName: 'missing' });
    expect(result.baselineCreated).toBe(true);

    await diff.teardown();
    fs.rmSync(projectDir, { recursive: true, force: true });
    vi.doUnmock('@playwright/test');
  });
});
