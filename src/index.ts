export { StoryDiff } from './story-diff.js';
export * from './errors.js';
export { compareImages } from './compare.js';
export { buildStoryUrl } from './storybook.js';
export {
  saveBaseline,
  loadBaseline,
  baselineExists,
  saveDiffOutput,
} from './snapshot-manager.js';

export type {
  StoryDiffConfig,
  Viewport,
  BrowserConfig,
  ComparisonConfig,
  CaptureOptions,
  AssertOptions,
  ComparisonResult,
  StoryVisualTest,
  BatchResult,
  LogLevel,
  LoggerConfig,
} from './story-diff.types.js';
