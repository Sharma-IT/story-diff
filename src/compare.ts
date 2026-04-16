import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import type { ComparisonConfig } from './story-diff.types.js';
import { SizeMismatchError } from './errors.js';

type CompareResult = {
  readonly match: boolean;
  readonly diffPixels: number;
  readonly diffPercentage: number;
  readonly diffImage: Buffer | null;
};

export function compareImages(
  actual: Buffer,
  expected: Buffer,
  config: ComparisonConfig = {},
): CompareResult {
  const {
    threshold = 0.1,
    failureThreshold = 0,
    failureThresholdType = 'percent',
    allowSizeMismatch = false,
  } = config;

  const actualPng = PNG.sync.read(actual);
  const expectedPng = PNG.sync.read(expected);

  const hasSizeMismatch =
    actualPng.width !== expectedPng.width || actualPng.height !== expectedPng.height;

  if (hasSizeMismatch && !allowSizeMismatch) {
    throw new SizeMismatchError(
      actualPng.width,
      actualPng.height,
      expectedPng.width,
      expectedPng.height
    );
  }

  if (hasSizeMismatch && allowSizeMismatch) {
    const maxWidth = Math.max(actualPng.width, expectedPng.width);
    const maxHeight = Math.max(actualPng.height, expectedPng.height);
    const totalPixels = maxWidth * maxHeight;
    const diffPixels = totalPixels;
    const diffPercentage = 100;

    const isWithinThreshold =
      failureThresholdType === 'percent'
        ? diffPercentage <= failureThreshold
        : diffPixels <= failureThreshold;

    return {
      match: isWithinThreshold,
      diffPixels,
      diffPercentage,
      diffImage: null,
    };
  }

  const { width, height } = actualPng;
  const totalPixels = width * height;
  const diffPng = new PNG({ width, height });

  const diffPixels = pixelmatch(
    actualPng.data,
    expectedPng.data,
    diffPng.data,
    width,
    height,
    { threshold },
  );

  const diffPercentage = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

  const isWithinThreshold =
    failureThresholdType === 'percent'
      ? diffPercentage <= failureThreshold
      : diffPixels <= failureThreshold;

  const match = diffPixels === 0 || isWithinThreshold;
  const diffImage = diffPixels > 0 ? PNG.sync.write(diffPng) : null;

  return { match, diffPixels, diffPercentage, diffImage };
}
