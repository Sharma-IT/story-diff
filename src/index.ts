export { StoryDiff } from './story-diff.js';
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
} from './story-diff.types.js';
