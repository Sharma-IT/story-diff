import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';

import {
  loadBaseline,
  saveBaseline,
  saveDiffOutput,
  baselineExists,
} from '../snapshot-manager.js';

function createTestPng(width = 10, height = 10): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('snapshot-manager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-diff-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('saveBaseline', () => {
    it('writes a PNG file and returns the file path', () => {
      const data = createTestPng();

      const result = saveBaseline(tempDir, 'my-component', data);

      expect(result).toBe(path.join(tempDir, 'my-component.png'));
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result)).toEqual(data);
    });

    it('creates the directory if it does not exist', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep');
      const data = createTestPng();

      const result = saveBaseline(nestedDir, 'test-snap', data);

      expect(fs.existsSync(result)).toBe(true);
    });

    it('overwrites an existing baseline', () => {
      const data1 = createTestPng(10, 10);
      const data2 = createTestPng(20, 20);
      saveBaseline(tempDir, 'overwrite-test', data1);

      saveBaseline(tempDir, 'overwrite-test', data2);

      const written = fs.readFileSync(path.join(tempDir, 'overwrite-test.png'));
      expect(written).toEqual(data2);
    });
  });

  describe('loadBaseline', () => {
    it('returns the baseline buffer for an existing snapshot', () => {
      const data = createTestPng();
      saveBaseline(tempDir, 'load-test', data);

      const result = loadBaseline(tempDir, 'load-test');

      expect(result).toEqual(data);
    });

    it('returns null for a non-existent snapshot', () => {
      const result = loadBaseline(tempDir, 'does-not-exist');

      expect(result).toBeNull();
    });
  });

  describe('baselineExists', () => {
    it('returns true when the baseline file exists', () => {
      saveBaseline(tempDir, 'exists-test', createTestPng());

      expect(baselineExists(tempDir, 'exists-test')).toBe(true);
    });

    it('returns false when the baseline file does not exist', () => {
      expect(baselineExists(tempDir, 'nope')).toBe(false);
    });
  });

  describe('saveDiffOutput', () => {
    it('saves diff image to __diff_output__ subdirectory', () => {
      const diffData = createTestPng();

      const result = saveDiffOutput(tempDir, 'my-diff', diffData);

      expect(result).toBe(path.join(tempDir, '__diff_output__', 'my-diff.png'));
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result)).toEqual(diffData);
    });

    it('creates the __diff_output__ directory if needed', () => {
      const diffData = createTestPng();

      const result = saveDiffOutput(tempDir, 'auto-dir', diffData);

      expect(fs.existsSync(path.join(tempDir, '__diff_output__'))).toBe(true);
      expect(fs.existsSync(result)).toBe(true);
    });
  });
});
