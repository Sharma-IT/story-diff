import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

import { compareImages } from '../compare.js';

function createSolidPng(
  width: number,
  height: number,
  colour: { r: number; g: number; b: number; a: number },
): Buffer {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = colour.r;
      png.data[idx + 1] = colour.g;
      png.data[idx + 2] = colour.b;
      png.data[idx + 3] = colour.a;
    }
  }

  return PNG.sync.write(png);
}

describe('compareImages', () => {
  // Requirement: Identical images should produce a match with zero diff
  // Case: happy-path
  // Invariant: diffPixels must be 0 and match must be true for identical inputs
  it('returns match with zero diff for identical images', () => {
    // Arrange
    const image = createSolidPng(100, 50, { r: 255, g: 0, b: 0, a: 255 });

    // Act
    const result = compareImages(image, image);

    // Assert
    expect(result.match).toBe(true);
    expect(result.diffPixels).toBe(0);
    expect(result.diffPercentage).toBe(0);
    expect(result.diffImage).toBeNull();
  });

  // Requirement: Different images should produce a mismatch with non-zero diff
  // Case: happy-path
  // Invariant: match must be false and diffPixels > 0 when images differ
  it('returns mismatch with diff image for different images', () => {
    // Arrange
    const red = createSolidPng(100, 50, { r: 255, g: 0, b: 0, a: 255 });
    const blue = createSolidPng(100, 50, { r: 0, g: 0, b: 255, a: 255 });

    // Act
    const result = compareImages(red, blue);

    // Assert
    expect(result.match).toBe(false);
    expect(result.diffPixels).toBeGreaterThan(0);
    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.diffImage).not.toBeNull();
    expect(result.diffImage).toBeInstanceOf(Buffer);
  });

  // Requirement: diffPercentage should be calculated as (diffPixels / totalPixels) * 100
  // Case: boundary
  // Invariant: fully different images should have ~100% diff
  it('calculates diffPercentage correctly for fully different images', () => {
    // Arrange
    const white = createSolidPng(10, 10, { r: 255, g: 255, b: 255, a: 255 });
    const black = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });

    // Act
    const result = compareImages(white, black);

    // Assert
    expect(result.diffPercentage).toBe(100);
    expect(result.diffPixels).toBe(100);
  });

  // Requirement: failureThreshold controls whether small diffs count as a match
  // Case: boundary
  // Invariant: diff below threshold → match, diff above threshold → mismatch
  it('treats diff below failureThreshold as a match', () => {
    // Arrange — create images that differ by a single pixel
    const image1 = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    // Copy from image1
    const parsed = PNG.sync.read(image1);
    parsed.data.copy(png2.data);
    // Change one pixel
    png2.data[0] = 200;
    const image2 = PNG.sync.write(png2);

    // Act — with a generous threshold
    const result = compareImages(image1, image2, {
      failureThreshold: 5,
      failureThresholdType: 'percent',
    });

    // Assert
    expect(result.match).toBe(true);
    expect(result.diffPixels).toBeGreaterThan(0);
  });

  // Requirement: failureThreshold with 'pixel' type uses pixel count directly
  // Case: happy-path
  // Invariant: diff of 1 pixel with threshold of 2 pixels → match
  it('supports pixel-based failure threshold', () => {
    // Arrange
    const image1 = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    const parsed = PNG.sync.read(image1);
    parsed.data.copy(png2.data);
    png2.data[0] = 200;
    const image2 = PNG.sync.write(png2);

    // Act
    const result = compareImages(image1, image2, {
      failureThreshold: 2,
      failureThresholdType: 'pixel',
    });

    // Assert
    expect(result.match).toBe(true);
  });

  // Requirement: Size mismatch should throw by default
  // Case: error
  // Invariant: different sized images must cause an error unless allowSizeMismatch is true
  it('throws on size mismatch by default', () => {
    // Arrange
    const small = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 255, g: 0, b: 0, a: 255 });

    // Act & Assert
    expect(() => compareImages(small, large)).toThrow(/size mismatch/i);
  });

  // Requirement: allowSizeMismatch should return mismatch instead of throwing
  // Case: boundary
  // Invariant: different sized images with allowSizeMismatch → returns result, does not throw
  it('returns mismatch result when allowSizeMismatch is true', () => {
    // Arrange
    const small = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 255, g: 0, b: 0, a: 255 });

    // Act
    const result = compareImages(small, large, { allowSizeMismatch: true });

    // Assert
    expect(result.match).toBe(false);
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  // Requirement: The diff image returned must be a valid PNG
  // Case: happy-path
  // Invariant: diffImage buffer must decode as a valid PNG with correct dimensions
  it('produces a valid PNG diff image', () => {
    // Arrange
    const red = createSolidPng(50, 30, { r: 255, g: 0, b: 0, a: 255 });
    const green = createSolidPng(50, 30, { r: 0, g: 255, b: 0, a: 255 });

    // Act
    const result = compareImages(red, green);

    // Assert
    expect(result.diffImage).not.toBeNull();
    const diffPng = PNG.sync.read(result.diffImage!);
    expect(diffPng.width).toBe(50);
    expect(diffPng.height).toBe(30);
  });
});
