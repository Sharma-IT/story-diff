import type { BrowserAdapter, PageAdapter } from './browser.js';
import { closeBrowser, createPage, launchBrowser } from './browser.js';
import { captureStory } from './capture.js';
import { compareImages } from './compare.js';
import { resolveStoryDiffConfig } from './config-loader.js';
import { loadBaseline, saveBaseline, saveDiffOutput } from './snapshot-manager.js';
import { waitForStorybookReady } from './storybook.js';
import { Logger } from './logger.js';
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
import { hookLifecycle } from './hooks.js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VIEWPORTS: Readonly<Record<string, Viewport>> = {
  mobile: { name: 'mobile', width: 393, height: 852 },
  tablet: { name: 'tablet', width: 768, height: 1024 },
  desktop: { name: 'desktop', width: 1440, height: 900 },
};

export class StoryDiff {
  private config: StoryDiffConfig | null;
  private logger: Logger;
  private browser: BrowserAdapter | null = null;
  private page: PageAdapter | null = null;

  constructor(config?: StoryDiffConfig) {
    this.config = config ?? null;
    this.logger = new Logger(config?.logger);

    if (config?.autoLifecycle) {
      hookLifecycle(this, config.autoLifecycle);
    }
  }

  async setup(): Promise<void> {
    const config = await this.getConfig();

    this.logger.info('Setting up StoryDiff...');
    this.logger.debug('Browser config:', config.browser);
    
    this.browser = await launchBrowser(config.browser, this.logger);
    this.page = await createPage(this.browser);
    
    this.logger.info(`Connecting to Storybook at ${config.storybookUrl}`);
    await waitForStorybookReady(this.page, config.storybookUrl, this.logger);
    
    this.logger.info('StoryDiff setup complete');
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      this.logger.info('Tearing down StoryDiff...');
      await closeBrowser(this.browser);
      this.browser = null;
      this.page = null;
      this.logger.info('StoryDiff teardown complete');
    }
  }

  async captureStory(storyId: string, options: CaptureOptions = {}): Promise<Buffer> {
    const config = await this.getConfig();
    const page = await this.getPage();
    const captureOptions = this.mergeCaptureOptions(config, options);
    const resolvedViewport = this.resolveViewport(captureOptions.viewport, config.viewports);

    if (resolvedViewport) {
      this.logger.debug(`Setting viewport to ${resolvedViewport.name} (${resolvedViewport.width}x${resolvedViewport.height})`);
      await page.setViewport({
        width: resolvedViewport.width,
        height: resolvedViewport.height,
      });
    }

    this.logger.info(`Capturing story: ${storyId}`);
    return captureStory(page, config.storybookUrl, storyId, captureOptions, this.logger);
  }

  async compareWithBaseline(
    screenshot: Buffer,
    snapshotName: string,
    comparisonOverride?: ComparisonConfig,
  ): Promise<ComparisonResult> {
    const config = await this.getConfig();
    const { 
      snapshotsDir, 
      comparison = {}, 
      update = false,
      failOnMissingBaseline = true 
    } = config;
    const mergedComparison = comparisonOverride 
      ? { ...comparison, ...comparisonOverride }
      : comparison;

    if (update) {
      this.logger.info(`Updating baseline: ${snapshotName}`);
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
        this.logger.warn(`Baseline missing: ${snapshotName}`);
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

      this.logger.info(`Creating new baseline: ${snapshotName}`);
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

    this.logger.debug(`Comparing with baseline: ${snapshotName}`);
    const compareResult = compareImages(screenshot, existing, mergedComparison, this.logger);
    const snapshotPath = `${snapshotsDir}/${snapshotName}.png`;

    let diffPath: string | null = null;
    if (!compareResult.match && compareResult.diffImage) {
      this.logger.warn(`Visual difference detected: ${snapshotName} (${compareResult.diffPercentage.toFixed(2)}%)`);
      diffPath = saveDiffOutput(snapshotsDir, snapshotName, compareResult.diffImage);
      this.logger.info(`Diff image saved: ${diffPath}`);
    } else {
      this.logger.debug(`Snapshot matches baseline: ${snapshotName}`);
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
    const config = await this.getConfig();
    return saveBaseline(config.snapshotsDir, snapshotName, screenshot);
  }

  async assertMatchesBaseline(
    storyId: string,
    options: AssertOptions,
  ): Promise<ComparisonResult> {
    const config = await this.getConfig();
    const mergedComparison = { ...config.comparison, ...options.comparison };

    if (mergedComparison.useNativeSnapshot && config.browser?.provider === 'playwright') {
      this.logger.info(`Using native Playwright snapshot for: ${options.snapshotName}`);
      return this.assertNativePlaywrightSnapshot(storyId, options, mergedComparison);
    }

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

  private async assertNativePlaywrightSnapshot(
    storyId: string,
    options: AssertOptions,
    comparison: ComparisonConfig,
  ): Promise<ComparisonResult> {
    const config = await this.getConfig();
    const pageAdapter = await this.getPage();
    
    // Ensure navigation and readiness
    // We call captureStory but we'll re-capture using native method
    // This ensures all the "Storybook logic" (globals, wait for selector, etc) is executed
    await this.captureStory(storyId, options);

    const playwrightPage = pageAdapter.getUnderlyingObject() as any;
    const { expect, test } = await import('@playwright/test').catch(() => {
      throw new Error("Native Playwright snapshots require '@playwright/test' to be installed.");
    });

    let testInfo: any;
    try {
      testInfo = test.info();
    } catch {
      // Not running in Playwright Test runner
    }

    const snapshotName = `${options.snapshotName}.png`;
    const snapshotPath = testInfo ? testInfo.snapshotPath(snapshotName) : path.join(config.snapshotsDir, snapshotName);

    // Map our comparison config to Playwright's toHaveScreenshot options
    const pwOptions: any = {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: comparison.threshold ?? 0.1,
    };

    if (comparison.failureThreshold !== undefined) {
      if (comparison.failureThresholdType === 'pixel') {
        pwOptions.maxDiffPixels = comparison.failureThreshold;
      } else {
        pwOptions.maxDiffPixelRatio = comparison.failureThreshold / 100;
      }
    }

    try {
      // If we're in a Playwright test and the snapshot is missing, and we're NOT failing on missing baseline,
      // we take the screenshot manually to avoid Playwright's expect failing the test.
      if (testInfo && snapshotPath && !fs.existsSync(snapshotPath) && config.failOnMissingBaseline === false) {
        this.logger.info(`Creating missing native baseline: ${snapshotPath}`);
        await playwrightPage.screenshot({ path: snapshotPath, ...pwOptions });
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

      // Use the page or element for snapshotting
      // Use only the filename, Playwright will use its default snapshot directory
      // which is usually next to the test file.
      await expect(playwrightPage).toHaveScreenshot(snapshotName, pwOptions);

      return {
        match: true,
        diffPixels: 0,
        diffPercentage: 0,
        diffImage: null,
        baselineCreated: false,
        baselineMissing: false,
        snapshotPath,
        diffPath: null,
      };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      
      // If it's a first run, Playwright might have created the baseline
      // Note: We use a regex to handle ANSI colors and varied formatting in different environments (like CI)
      const isBaselineMissing = /snapshot.*doesn't.*exist|writing.*actual|no.*snapshot|snapshot.*not.*found|missing.*baseline/i.test(errorMessage);
      
      if (isBaselineMissing) {
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

      // Extract details from Playwright error if possible, or just re-throw as VisualRegressionError
      this.logger.error(`Native Playwright snapshot failed: ${error.message}`);
      
      throw new VisualRegressionError(
        options.snapshotName,
        100, // We don't have exact metrics easily from the error object
        0,
        snapshotPath,
        null // Playwright saves diffs elsewhere by default
      );
    }
  }

  async runAll(tests?: readonly StoryVisualTest[]): Promise<readonly BatchResult[]> {
    const config = await this.getConfig();
    const results: BatchResult[] = [];
    const testsToRun = tests ?? config.tests ?? [];
    
    this.logger.info(`Running batch tests for ${testsToRun.length} component(s)`);

    for (const test of testsToRun) {
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
    
    this.logger.info(`Batch tests complete: ${results.length} snapshot(s) processed`);

    return results;
  }

  private resolveViewport(
    viewport: string | Viewport | undefined,
    configuredViewports?: Readonly<Record<string, Viewport>>,
  ): Viewport | null {
    if (!viewport) return null;

    if (typeof viewport === 'object') return viewport;

    const viewports = configuredViewports ?? DEFAULT_VIEWPORTS;
    const resolved = viewports[viewport];

    if (!resolved) {
      throw new ViewportNotFoundError(viewport, Object.keys(viewports));
    }

    return resolved;
  }

  private async getPage(): Promise<PageAdapter> {
    if (!this.page) {
      throw new NotInitializedError();
    }
    return this.page;
  }

  private async getConfig(): Promise<StoryDiffConfig> {
    if (this.config) {
      return this.config;
    }

    this.config = await resolveStoryDiffConfig();
    this.logger = new Logger(this.config.logger);
    return this.config;
  }

  private mergeCaptureOptions(
    config: StoryDiffConfig,
    options: CaptureOptions,
  ): CaptureOptions {
    const defaults = config.defaults ?? {};
    const defaultGlobals = defaults.globals ?? {};
    const optionGlobals = options.globals ?? {};
    const mergedGlobals = { ...defaultGlobals, ...optionGlobals };

    return {
      ...defaults,
      ...options,
      globals: Object.keys(mergedGlobals).length > 0 ? mergedGlobals : undefined,
    };
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
