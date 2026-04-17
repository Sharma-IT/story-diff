import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

import { compareImages } from '../compare.js';
import { SizeMismatchError } from '../errors.js';

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
  it('returns match with zero diff for identical images', () => {
    const image = createSolidPng(100, 50, { r: 255, g: 0, b: 0, a: 255 });

    const result = compareImages(image, image);

    expect(result.match).toBe(true);
    expect(result.diffPixels).toBe(0);
    expect(result.diffPercentage).toBe(0);
    expect(result.diffImage).toBeNull();
  });

  it('returns mismatch with diff image for different images', () => {
    const red = createSolidPng(100, 50, { r: 255, g: 0, b: 0, a: 255 });
    const blue = createSolidPng(100, 50, { r: 0, g: 0, b: 255, a: 255 });

    const result = compareImages(red, blue);

    expect(result.match).toBe(false);
    expect(result.diffPixels).toBeGreaterThan(0);
    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.diffImage).not.toBeNull();
    expect(result.diffImage).toBeInstanceOf(Buffer);
  });

  it('calculates diffPercentage correctly for fully different images', () => {
    const white = createSolidPng(10, 10, { r: 255, g: 255, b: 255, a: 255 });
    const black = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });

    const result = compareImages(white, black);

    expect(result.diffPercentage).toBe(100);
    expect(result.diffPixels).toBe(100);
  });

  it('treats diff below failureThreshold as a match', () => {
    const image1 = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    const parsed = PNG.sync.read(image1);
    parsed.data.copy(png2.data);
    png2.data[0] = 200;
    const image2 = PNG.sync.write(png2);

    const result = compareImages(image1, image2, {
      failureThreshold: 5,
      failureThresholdType: 'percent',
    });

    expect(result.match).toBe(true);
    expect(result.diffPixels).toBeGreaterThan(0);
  });

  it('supports pixel-based failure threshold', () => {
    const image1 = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    const parsed = PNG.sync.read(image1);
    parsed.data.copy(png2.data);
    png2.data[0] = 200;
    const image2 = PNG.sync.write(png2);

    const result = compareImages(image1, image2, {
      failureThreshold: 2,
      failureThresholdType: 'pixel',
    });

    expect(result.match).toBe(true);
  });

  it('throws on size mismatch by default', () => {
    const small = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 255, g: 0, b: 0, a: 255 });

    expect(() => compareImages(small, large)).toThrow(SizeMismatchError);
    try {
      compareImages(small, large);
    } catch (e) {
      if (e instanceof SizeMismatchError) {
        expect(e.message).toMatch(/actual 10x10 vs expected 20x20/);
      }
    }
  });

  it('returns mismatch result when allowSizeMismatch is true', () => {
    const small = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 255, g: 0, b: 0, a: 255 });

    const result = compareImages(small, large, { allowSizeMismatch: true });

    expect(result.match).toBe(false);
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  it('produces a valid PNG diff image', () => {
    const red = createSolidPng(50, 30, { r: 255, g: 0, b: 0, a: 255 });
    const green = createSolidPng(50, 30, { r: 0, g: 255, b: 0, a: 255 });

    const result = compareImages(red, green);

    expect(result.diffImage).not.toBeNull();
    const diffPng = PNG.sync.read(result.diffImage!);
    expect(diffPng.width).toBe(50);
    expect(diffPng.height).toBe(30);
  });
});
