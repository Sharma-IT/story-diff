import { describe, it, expect } from 'vitest';
import {
  NotInitializedError,
  ViewportNotFoundError,
  SizeMismatchError,
  VisualRegressionError,
  BaselineMissingError,
  StorybookConnectionError,
  ConfigNotFoundError,
  InvalidConfigError,
} from '../errors.js';

describe('Errors', () => {
  it('instantiates NotInitializedError', () => {
    const error = new NotInitializedError();
    expect(error.message).toMatch(/not initialised/i);
    expect(error.name).toBe('NotInitializedError');
  });

  it('instantiates ViewportNotFoundError', () => {
    const error = new ViewportNotFoundError('unknown', ['mobile', 'desktop']);
    expect(error.message).toContain('Unknown viewport "unknown"');
    expect(error.name).toBe('ViewportNotFoundError');
  });

  it('instantiates SizeMismatchError', () => {
    const error = new SizeMismatchError(100, 200, 300, 400);
    expect(error.message).toContain('actual 100x200 vs expected 300x400');
  });

  it('instantiates VisualRegressionError with and without diff image', () => {
    const errorWithDiff = new VisualRegressionError(
      'snap1',
      10,
      500,
      '/path/to/snap',
      '/path/to/diff',
    );
    expect(errorWithDiff.message).toContain('snap1');
    expect(errorWithDiff.message).toContain('10.00%');
    expect(errorWithDiff.message).toContain('Diff image: /path/to/diff');

    const errorWithoutDiff = new VisualRegressionError('snap2', 5, 200, '/path/to/snap2', null);
    expect(errorWithoutDiff.message).toBe(
      'Visual regression detected for "snap2".\nDiff: 5.00% (200 pixels)',
    );
    expect(errorWithoutDiff.message).not.toContain('Diff image:');
    expect(errorWithoutDiff.name).toBe('VisualRegressionError');
  });

  it('instantiates BaselineMissingError', () => {
    const error = new BaselineMissingError('snap4', '/path/to/baseline.png');
    expect(error.message).toBe(
      'Baseline image missing for "snap4". Expected at /path/to/baseline.png.',
    );
    expect(error.name).toBe('BaselineMissingError');
  });

  it('instantiates StorybookConnectionError', () => {
    const error1 = new StorybookConnectionError('http://localhost');
    expect(error1.message).toBe('Failed to connect to Storybook at http://localhost');

    const error2 = new StorybookConnectionError('http://localhost', 'timeout');
    expect(error2.message).toBe('Failed to connect to Storybook at http://localhost: timeout');
  });

  it('instantiates ConfigNotFoundError', () => {
    const error = new ConfigNotFoundError(['file.js']);
    expect(error.message).toContain('Pass config to the constructor or add one of: file.js.');
  });

  it('instantiates InvalidConfigError', () => {
    const error = new InvalidConfigError('/config.js', 'bad data');
    expect(error.message).toContain('Invalid StoryDiff configuration in /config.js: bad data');
  });

  it('ViewportNotFoundError separates available viewports with comma+space', () => {
    // Requirement: available.join(', ') must use ', ' separator (not '')
    // Case: boundary — multiple available viewports
    const error = new ViewportNotFoundError('huge', ['mobile', 'tablet', 'desktop']);
    expect(error.message).toContain('mobile, tablet, desktop');
    // If join('') were used: 'mobiletabletdesktop' — the comma+space must be present
    expect(error.message).toContain(', ');
  });

  it('ConfigNotFoundError separates file names with comma+space', () => {
    // Requirement: fileNames.join(', ') must use ', ' separator (not '')
    // Case: boundary — multiple file names
    const error = new ConfigNotFoundError(['story-diff.config.mjs', 'story-diff.json']);
    expect(error.message).toContain('story-diff.config.mjs, story-diff.json');
    expect(error.message).toContain(', ');
  });
});
