/**
 * Base error class for all Story Diff errors.
 */
export class StoryDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when StoryDiff is used before calling setup().
 */
export class NotInitializedError extends StoryDiffError {
  constructor() {
    super('StoryDiff not initialised. Call setup() first.');
  }
}

/**
 * Thrown when an unknown viewport name is used.
 */
export class ViewportNotFoundError extends StoryDiffError {
  constructor(viewport: string, available: string[]) {
    super(`Unknown viewport "${viewport}". Available: ${available.join(', ')}`);
  }
}

/**
 * Thrown when images have different dimensions and allowSizeMismatch is false.
 */
export class SizeMismatchError extends StoryDiffError {
  constructor(actualWidth: number, actualHeight: number, expectedWidth: number, expectedHeight: number) {
    super(
      `Image size mismatch: actual ${actualWidth}x${actualHeight} vs expected ${expectedWidth}x${expectedHeight}`
    );
  }
}

/**
 * Thrown when a visual regression is detected.
 */
export class VisualRegressionError extends StoryDiffError {
  constructor(
    public readonly snapshotName: string,
    public readonly diffPercentage: number,
    public readonly diffPixels: number,
    public readonly snapshotPath: string,
    public readonly diffPath: string | null
  ) {
    const diffInfo = diffPath ? `\nDiff image: ${diffPath}` : '';
    super(
      `Visual regression detected for "${snapshotName}".\n` +
      `Diff: ${diffPercentage.toFixed(2)}% (${diffPixels} pixels)` +
      diffInfo
    );
  }
}

/**
 * Thrown when a baseline image is missing and failOnMissingBaseline is true.
 */
export class BaselineMissingError extends StoryDiffError {
  constructor(public readonly snapshotName: string, public readonly snapshotPath: string) {
    super(`Baseline image missing for "${snapshotName}". Expected at ${snapshotPath}.`);
  }
}

/**
 * Thrown when Storybook cannot be reached or fails to load.
 */
export class StorybookConnectionError extends StoryDiffError {
  constructor(url: string, detail?: string) {
    const message = detail 
      ? `Failed to connect to Storybook at ${url}: ${detail}`
      : `Failed to connect to Storybook at ${url}`;
    super(message);
  }
}

/**
 * Thrown when StoryDiff cannot find a root configuration file.
 */
export class ConfigNotFoundError extends StoryDiffError {
  constructor(fileNames: readonly string[]) {
    super(
      `StoryDiff configuration not found. Pass config to the constructor or add one of: ${fileNames.join(', ')}.`
    );
  }
}

/**
 * Thrown when a discovered configuration file cannot be parsed or normalised.
 */
export class InvalidConfigError extends StoryDiffError {
  constructor(filePath: string, detail: string) {
    super(`Invalid StoryDiff configuration in ${filePath}: ${detail}`);
  }
}
