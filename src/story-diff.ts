import type { Browser, Page } from 'puppeteer';

import { closeBrowser, createPage, launchBrowser } from './browser.js';
import { captureStory } from './capture.js';
import { compareImages } from './compare.js';
import { loadBaseline, saveBaseline, saveDiffOutput } from './snapshot-manager.js';
import { waitForStorybookReady } from './storybook.js';
import type {
  AssertOptions,
  BatchResult,
  CaptureOptions,
  ComparisonConfig,
  ComparisonResult,
  StoryDiffConfig,
  StoryVisualTest,
  Viewport,
} from './story-diff.types.js';
import {
  BaselineMissingError,
  NotInitializedError,
  ViewportNotFoundError,
  VisualRegressionError,
} from './errors.js';

const DEFAULT_VIEWPORTS: Readonly<Record<string, Viewport>> = {
  mobile: { name: 'mobile', width: 393, height: 852 },
  tablet: { name: 'tablet', width: 768, height: 1024 },
  desktop: { name: 'desktop', width: 1440, height: 900 },
};

export class StoryDiff {
  private readonly config: StoryDiffConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config: StoryDiffConfig) {
    this.config = config;
  }

  async setup(): Promise<void> {
    this.browser = await launchBrowser(this.config.browser);
    this.page = await createPage(this.browser);
    await waitForStorybookReady(this.page, this.config.storybookUrl);
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      await closeBrowser(this.browser);
      this.browser = null;
      this.page = null;
    }
  }

  async captureStory(storyId: string, options: CaptureOptions = {}): Promise<Buffer> {
    const page = await this.getPage();
    const resolvedViewport = this.resolveViewport(options.viewport);

    if (resolvedViewport) {
      await page.setViewport({
        width: resolvedViewport.width,
        height: resolvedViewport.height,
      });
    }

    return captureStory(page, this.config.storybookUrl, storyId, options);
  }

  async compareWithBaseline(
    screenshot: Buffer,
    snapshotName: string,
    comparisonOverride?: ComparisonConfig,
  ): Promise<ComparisonResult> {
    const { 
      snapshotsDir, 
      comparison = {}, 
      update = false,
      failOnMissingBaseline = true 
    } = this.config;
    const mergedComparison = comparisonOverride 
      ? { ...comparison, ...comparisonOverride }
      : comparison;

    if (update) {
      const snapshotPath = saveBaseline(snapshotsDir, snapshotName, screenshot);
      return {
        match: true,
        diffPixels: 0,
        diffPercentage: 0,
        diffImage: null,
        baselineCreated: true,
        baselineMissing: false,
        snapshotPath,
        diffPath: null,
      };
    }

    const existing = loadBaseline(snapshotsDir, snapshotName);

    if (!existing) {
      if (failOnMissingBaseline) {
        return {
          match: false,
          diffPixels: 0,
          diffPercentage: 0,
          diffImage: null,
          baselineCreated: false,
          baselineMissing: true,
          snapshotPath: `${snapshotsDir}/${snapshotName}.png`,
          diffPath: null,
        };
      }

      const snapshotPath = saveBaseline(snapshotsDir, snapshotName, screenshot);
      return {
        match: true,
        diffPixels: 0,
        diffPercentage: 0,
        diffImage: null,
        baselineCreated: true,
        baselineMissing: false,
        snapshotPath,
        diffPath: null,
      };
    }

    const compareResult = compareImages(screenshot, existing, mergedComparison);
    const snapshotPath = `${snapshotsDir}/${snapshotName}.png`;

    let diffPath: string | null = null;
    if (!compareResult.match && compareResult.diffImage) {
      diffPath = saveDiffOutput(snapshotsDir, snapshotName, compareResult.diffImage);
    }

    return {
      match: compareResult.match,
      diffPixels: compareResult.diffPixels,
      diffPercentage: compareResult.diffPercentage,
      diffImage: compareResult.diffImage,
      baselineCreated: false,
      baselineMissing: false,
      snapshotPath,
      diffPath,
    };
  }

  async updateBaseline(screenshot: Buffer, snapshotName: string): Promise<string> {
    return saveBaseline(this.config.snapshotsDir, snapshotName, screenshot);
  }

  async assertMatchesBaseline(
    storyId: string,
    options: AssertOptions,
  ): Promise<ComparisonResult> {
    const screenshot = await this.captureStory(storyId, options);
    const result = await this.compareWithBaseline(
      screenshot,
      options.snapshotName,
      options.comparison,
    );

    if (result.baselineMissing) {
      throw new BaselineMissingError(options.snapshotName, result.snapshotPath);
    }

    if (!result.match && !result.baselineCreated) {
      throw new VisualRegressionError(
        options.snapshotName,
        result.diffPercentage,
        result.diffPixels,
        result.snapshotPath,
        result.diffPath
      );
    }

    return result;
  }

  async runAll(tests: readonly StoryVisualTest[]): Promise<readonly BatchResult[]> {
    const results: BatchResult[] = [];

    for (const test of tests) {
      const viewports = test.viewports ?? ['desktop'];

      for (const story of test.stories) {
        const storyId = `${test.storyPath}--${story}`;

        for (const viewportName of viewports) {
          const snapshotName = buildSnapshotName(
            test.componentName,
            story,
            viewportName,
          );

          const result = await this.assertMatchesBaseline(storyId, {
            snapshotName,
            viewport: viewportName,
            globals: test.globals,
          });

          results.push({ storyId, snapshotName, viewport: viewportName, result });
        }
      }
    }

    return results;
  }

  private resolveViewport(viewport?: string | Viewport): Viewport | null {
    if (!viewport) return null;

    if (typeof viewport === 'object') return viewport;

    const viewports = this.config.viewports ?? DEFAULT_VIEWPORTS;
    const resolved = viewports[viewport];

    if (!resolved) {
      throw new ViewportNotFoundError(viewport, Object.keys(viewports));
    }

    return resolved;
  }

  private async getPage(): Promise<Page> {
    if (!this.page) {
      throw new NotInitializedError();
    }
    return this.page;
  }
}

function buildSnapshotName(
  componentName: string,
  story: string,
  viewport: string,
): string {
  const comp = componentName.toLowerCase();

  // Remove component name from story to avoid duplication like "button-primary-button"
  let cleanStory = story;
  if (story.startsWith(`${comp}-`)) {
    cleanStory = story.slice(comp.length + 1);
  } else if (story.endsWith(`-${comp}`)) {
    cleanStory = story.slice(0, -(comp.length + 1));
  }

  return `${comp}-${cleanStory}-${viewport}`;
}
