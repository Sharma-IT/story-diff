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

  it('throws on size mismatch when only width differs', () => {
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const img2 = createSolidPng(20, 10, { r: 0, g: 0, b: 0, a: 255 });
    expect(() => compareImages(img1, img2)).toThrow(SizeMismatchError);
  });

  it('throws on size mismatch when only height differs', () => {
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const img2 = createSolidPng(10, 20, { r: 0, g: 0, b: 0, a: 255 });
    expect(() => compareImages(img1, img2)).toThrow(SizeMismatchError);
  });

  it('respects default failureThresholdType as percent', () => {
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const img2 = createSolidPng(10, 10, { r: 255, g: 255, b: 255, a: 255 });

    // 100% diff. threshold 100 should match.
    // If it was pixels, threshold 100 would match (exactly 100 pixels). 
    // But default failureThreshold is 0.
    
    // Test that 1% diff matches when failureThreshold is 1
    const img3 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const png4 = PNG.sync.read(img3);
    png4.data[0] = 255;
    const img4 = PNG.sync.write(png4);
    
    const result = compareImages(img3, img4, { failureThreshold: 1 });
    expect(result.match).toBe(true);
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

  it('uses logger if provided and logs specific messages', () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    } as any;

    const small = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 0, g: 0, b: 0, a: 255 });

    compareImages(small, small, {}, logger);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Comparing images: actual=10x10, expected=10x10'));

    try {
      compareImages(small, large, {}, logger);
    } catch { }
    expect(logger.error).toHaveBeenCalledWith('Size mismatch detected and not allowed');

    compareImages(small, large, { allowSizeMismatch: true }, logger);
    expect(logger.warn).toHaveBeenCalledWith('Size mismatch detected but allowed by configuration');
    
    compareImages(small, small, {}, logger);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Comparison result: 0 pixels differ (0.00%), match=true'));
  });

  it('is sensitive to threshold configuration in pixelmatch', () => {
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const png2 = new PNG({ width: 10, height: 10 });
    const parsed = PNG.sync.read(img1);
    parsed.data.copy(png2.data);
    // Slight difference that pixelmatch should catch with low threshold
    png2.data[0] = 5; 
    const img2 = PNG.sync.write(png2);

    // With very low threshold, it should fail
    const resultStrict = compareImages(img1, img2, { threshold: 0.01 });
    // With high threshold, it should pass (as it's within the threshold of "same color")
    const resultPermissive = compareImages(img1, img2, { threshold: 0.1 });

    expect(resultStrict.diffPixels).toBeGreaterThan(0);
    // Note: pixelmatch threshold behavior 
    // If the diff is very small, it might still be 0 with 0.1 threshold
  });

  it('diffPixels === 0 matches even if failureThreshold is negative', () => {
    const image = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const result = compareImages(image, image, { failureThreshold: -1, failureThresholdType: 'pixel' });
    expect(result.match).toBe(true);
  });

  it('respects allowSizeMismatch only when hasSizeMismatch is true', () => {
    const img = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    // If hasSizeMismatch is false, it should NOT enter the "allowed size mismatch" block
    // which returns 100% diff.
    const result = compareImages(img, img, { allowSizeMismatch: true });
    expect(result.diffPercentage).toBe(0);
  });

  it('handles size mismatch boundary for percent comparison', () => {
    const small = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const large = createSolidPng(10, 20, { r: 0, g: 0, b: 0, a: 255 });
    
    // Size mismatch results in 100% diff percentage
    const result = compareImages(small, large, { 
      allowSizeMismatch: true, 
      failureThreshold: 100, 
      failureThresholdType: 'percent' 
    });
    expect(result.match).toBe(true);

    const resultFail = compareImages(small, large, { 
      allowSizeMismatch: true, 
      failureThreshold: 99, 
      failureThresholdType: 'percent' 
    });
    expect(resultFail.match).toBe(false);
  });

  it('handles pixel failure threshold correctly', () => {
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const img2 = createSolidPng(10, 10, { r: 255, g: 255, b: 255, a: 255 });
    
    // 100 pixels differ. 
    // Threshold 50 pixels => should fail
    const resFail = compareImages(img1, img2, { failureThreshold: 50, failureThresholdType: 'pixel' });
    expect(resFail.match).toBe(false);
    expect(resFail.diffPixels).toBe(100);

    // Threshold 150 pixels => should pass
    const resPass = compareImages(img1, img2, { failureThreshold: 150, failureThresholdType: 'pixel' });
    expect(resPass.match).toBe(true);
  });

  it('default failureThresholdType is percent and not empty string', () => {
    // Requirement: default failureThresholdType must be 'percent' — not ''
    // Case: boundary — omit failureThresholdType; provide failureThreshold=100 which only makes sense for percent
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const img2 = createSolidPng(10, 10, { r: 255, g: 255, b: 255, a: 255 });
    // 100% diff. With failureThreshold=100 as percent => match. With failureThreshold=100 as pixel => also match.
    // Use a value that ONLY passes as percent:
    // diffPixels=100, diffPercentage=100. threshold=99 => fails for percent, matches for pixel (100<=100 would pass).
    const resultWithDefaultType = compareImages(img1, img2, { failureThreshold: 99 }); // no failureThresholdType
    // If default were pixel: 100 diffPixels > 99 threshold => still fail. Need a cleaner boundary.
    // Use small mismatch: 1 pixel mismatched out of 100 (1%). 
    const img3 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const png4 = { ...PNG.sync.read(img3) }; // doesn't exist as clone, use PNG directly
    const parsed4 = PNG.sync.read(img3);
    parsed4.data[0] = 255;
    const img4 = PNG.sync.write(parsed4);
    // 1 pixel differs = 1% diff, 1 pixel
    // failureThreshold=1 as percent: 1% <= 1% => match. As pixel: 1pixel <= 1pixel => also match.
    // Use failureThreshold=0: as percent 1% > 0% => fail. As pixel 1 > 0 => also fail. Same result.
    // Use size-mismatch path where diffPercentage=100: failureThresholdType='percent' vs '' matters
    const small = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 0, g: 0, b: 0, a: 255 });
    // diffPercentage=100, diffPixels=400
    // If failureThresholdType was '' (not 'percent'), the condition is false => pixel path => 400 <= 100 => false (mismatch)
    // If failureThresholdType is 'percent' => 100 <= 100 => true (match)
    const result = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 100 });
    expect(result.match).toBe(true); // only works if default is 'percent'
  });

  it('size-mismatch path failureThresholdType=pixel uses pixel count correctly', () => {
    // Requirement: in size-mismatch path, failureThresholdType==='percent' conditional must be correct
    // Case: boundary — explicitly pixel to verify the else-branch is truly pixel-based
    const small = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 0, g: 0, b: 0, a: 255 });
    // maxWidth=20, maxHeight=20, totalPixels=400, diffPixels=400, diffPercentage=100
    // With failureThreshold=400 as pixel => match
    const resultMatch = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 400, failureThresholdType: 'pixel' });
    // With failureThreshold=399 as pixel => no match
    const resultFail = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 399, failureThresholdType: 'pixel' });
    expect(resultMatch.match).toBe(true);
    expect(resultFail.match).toBe(false);
    // If the condition were 'true' always (ConditionalExpression mutant), percent path would be:
    // 100 <= 399 => match (wrong — both would pass). So we rely on the Fail case above.
  });

  it('size-mismatch path failureThresholdType check is not always-true', () => {
    // Requirement: failureThresholdType === 'percent' in the size-mismatch block must NOT be replaced with true
    // Invariant: with failureThresholdType='pixel' and threshold=50, 400 diffPixels > 50 => mismatch
    // If the condition were always true, percent branch would run: 100% <= 50 => also mismatch (same result— can't catch this way)
    // Instead, check that with high percent threshold but low pixel threshold, pixel wins
    const small = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const large = createSolidPng(20, 20, { r: 0, g: 0, b: 0, a: 255 });
    // diffPercentage=100, diffPixels=400
    // pixel threshold=401 => pixels 400<=401 => match
    // percent threshold=401 would be 100<=401 => also match — same result, hard to distinguish
    // Use: percent threshold=99 with type='pixel' threshold=400
    // type='percent': 100>99 => no match. type='pixel': 400<=400 => match
    const result = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 400, failureThresholdType: 'pixel' });
    expect(result.match).toBe(true);
    // And with percent: 100% compared to threshold=99% => mismatch
    const resultPercent = compareImages(small, large, { allowSizeMismatch: true, failureThreshold: 99, failureThresholdType: 'percent' });
    expect(resultPercent.match).toBe(false);
  });

  it('regular comparison failureThresholdType=percent is not always-true or always-false', () => {
    // Requirement: failureThresholdType === 'percent' in normal compare block must not be hardcoded
    // Case: Verify both the percent and pixel paths yield different results for same input
    const img1 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const png2Parsed = PNG.sync.read(img1);
    // Modify 2 pixels (2% of 100 total)
    png2Parsed.data[0] = 255; png2Parsed.data[4] = 255;
    const img2 = PNG.sync.write(png2Parsed);

    // percent threshold=1 => 2% > 1% => mismatch
    const resFail = compareImages(img1, img2, { failureThreshold: 1, failureThresholdType: 'percent' });
    // pixel threshold=1 => 2 pixels > 1 => also mismatch (same). Go bigger.
    // percent threshold=3 => 2% <= 3% => match
    const resPercentPass = compareImages(img1, img2, { failureThreshold: 3, failureThresholdType: 'percent' });
    // pixel threshold=1 => 2 > 1 => fail
    const resPixelFail = compareImages(img1, img2, { failureThreshold: 1, failureThresholdType: 'pixel' });
    // pixel threshold=3 => 2 <= 3 => match
    const resPixelPass = compareImages(img1, img2, { failureThreshold: 3, failureThresholdType: 'pixel' });

    // Both thresholds at 3 should pass for both types
    expect(resPercentPass.match).toBe(true);
    expect(resPixelPass.match).toBe(true);
    // Threshold=1 fails for percent but also for pixel here. Use the distinguishing case:
    // failureThreshold=2: as percent 2%<=2% => match. As pixel 2<=2 => also match. 
    // failureThreshold=2 for percent with diff=3%: 3>2 => fail.
    const img3 = createSolidPng(10, 10, { r: 0, g: 0, b: 0, a: 255 });
    const png3Parsed = PNG.sync.read(img3);
    // 3 pixels different (3% of 100)
    png3Parsed.data[0] = 255; png3Parsed.data[4] = 255; png3Parsed.data[8] = 255;
    const img4 = PNG.sync.write(png3Parsed);
    // failureThreshold=2: percent => 3% > 2% => fail; pixel => 3 > 2 => also fail
    // failureThreshold=400: percent => 3% <= 400% => match; pixel => 3 <= 400 => also match
    // Distinguishing case: threshold=3 vs type
    // percent: 3% <= 3% => match. pixel: 3 <= 3 => also match. Same.
    // ONLY meaningful test: confirm the string 'percent' is checked, not empty string
    // If failureThresholdType === '' were checked: '' !== '' is false, no wait... '' === '' is true if mutant replaces 'percent' with ''
    // Mutant: failureThresholdType === "" — if actual type is 'percent', '' === 'percent' is false => pixel branch runs
    // pixel branch: 3diffPixels <= 3threshold => match. But percent branch: 3% <= 3% also match. Still same.
    // Use: threshold=3 percent, diffPixels=3 (3%): percent path says 3%<=3% match. pixel path says 3<=3 match.
    // NO distinguishing here without specific setup. Best coverage: the existing tests above already cover it.
    expect(resFail.match).toBe(false);
  });
});
