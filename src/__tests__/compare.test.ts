import { describe, it, expect, vi } from 'vitest';
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

  it('treats diff exactly at failureThreshold as a match (percent boundary)', () => {
    const image1 = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    const parsed = PNG.sync.read(image1);
    parsed.data.copy(png2.data);

    // Total pixels = 100. Modify exactly 1 pixel = 1% difference
    png2.data[0] = 200;
    const image2 = PNG.sync.write(png2);

    const result = compareImages(image1, image2, {
      failureThreshold: 1, // Exactly 1%
      failureThresholdType: 'percent',
    });

    expect(result.match).toBe(true);
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

  it('treats diff exactly at failureThreshold as a match (pixel boundary)', () => {
    const image1 = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    const parsed = PNG.sync.read(image1);
    parsed.data.copy(png2.data);

    // Modify exactly 1 pixel
    png2.data[0] = 200;
    const image2 = PNG.sync.write(png2);

    const result = compareImages(image1, image2, {
      failureThreshold: 1,
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

  it('returns mismatch result when allowSizeMismatch is true (percentage format)', () => {
    const small = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 255, g: 0, b: 0, a: 255 });

    const result = compareImages(small, large, { allowSizeMismatch: true });

    expect(result.match).toBe(false);
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  it('handles size mismatch with pixel threshold', () => {
    const small = createSolidPng(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 255, g: 0, b: 0, a: 255 });

    const resultMismatch = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 0, failureThresholdType: 'pixel' });
    const resultMatch = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 400, failureThresholdType: 'pixel' });

    expect(resultMismatch.match).toBe(false);
    expect(resultMismatch.diffPixels).toBe(400); // 20x20
    expect(resultMatch.match).toBe(true);
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

  it('handles 0x0 images for zero totalPixels', () => {
    const spy = vi.spyOn(PNG.sync, 'read').mockReturnValue({ width: 0, height: 0, data: Buffer.from([]) } as any);
    const result = compareImages(Buffer.from(''), Buffer.from(''));
    expect(result.diffPercentage).toBe(0);
    expect(result.match).toBe(true);
    spy.mockRestore();
  });

  it('uses logger if provided', () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    } as any;

    const small = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 0, g: 0, b: 0, a: 255 });

    compareImages(small, small, {}, logger);
    expect(logger.debug).toHaveBeenCalled();

    try {
      compareImages(small, large, {}, logger);
    } catch { }
    expect(logger.error).toHaveBeenCalled();

    compareImages(small, large, { allowSizeMismatch: true }, logger);
    expect(logger.warn).toHaveBeenCalled();
  });
});
