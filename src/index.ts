export { StoryDiff } from './story-diff.js';
export { hookLifecycle } from './hooks.js';
export * from './errors.js';
export { compareImages } from './compare.js';
export { buildStoryUrl } from './storybook.js';
export { saveBaseline, loadBaseline, baselineExists, saveDiffOutput } from './snapshot-manager.js';

export type {
  StoryDiffConfig,
  Viewport,
  BrowserConfig,
  BrowserProvider,
  PlaywrightBrowserName,
  ComparisonConfig,
  CaptureOptions,
  AssertOptions,
  ComparisonResult,
  StoryVisualTest,
  BatchResult,
  LogLevel,
  LoggerConfig,
} from './story-diff.types.js';
