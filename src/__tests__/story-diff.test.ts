import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StoryDiff } from '../story-diff.js';
import { BaselineMissingError } from '../errors.js';

const mocks = vi.hoisted(() => ({
  captureStoryMock: vi.fn().mockResolvedValue(Buffer.from('dummy-image')),
  waitForStorybookReadyMock: vi.fn(),
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
});
