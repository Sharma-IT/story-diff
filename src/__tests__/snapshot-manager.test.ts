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
    // Requirement: Saving a baseline should write a PNG file to the snapshots directory
    // Case: happy-path
    // Invariant: returned path must point to an existing file with correct content
    it('writes a PNG file and returns the file path', () => {
      // Arrange
      const data = createTestPng();

      // Act
      const result = saveBaseline(tempDir, 'my-component', data);

      // Assert
      expect(result).toBe(path.join(tempDir, 'my-component.png'));
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result)).toEqual(data);
    });

    // Requirement: saveBaseline should create the directory if it does not exist
    // Case: boundary
    // Invariant: directory must be auto-created
    it('creates the directory if it does not exist', () => {
      // Arrange
      const nestedDir = path.join(tempDir, 'nested', 'deep');
      const data = createTestPng();

      // Act
      const result = saveBaseline(nestedDir, 'test-snap', data);

      // Assert
      expect(fs.existsSync(result)).toBe(true);
    });

    // Requirement: saveBaseline should overwrite an existing file
    // Case: boundary
    // Invariant: file content must be the new data after overwrite
    it('overwrites an existing baseline', () => {
      // Arrange
      const data1 = createTestPng(10, 10);
      const data2 = createTestPng(20, 20);
      saveBaseline(tempDir, 'overwrite-test', data1);

      // Act
      saveBaseline(tempDir, 'overwrite-test', data2);

      // Assert
      const written = fs.readFileSync(path.join(tempDir, 'overwrite-test.png'));
      expect(written).toEqual(data2);
    });
  });

  describe('loadBaseline', () => {
    // Requirement: Loading an existing baseline should return its buffer
    // Case: happy-path
    // Invariant: returned buffer must match the saved data
    it('returns the baseline buffer for an existing snapshot', () => {
      // Arrange
      const data = createTestPng();
      saveBaseline(tempDir, 'load-test', data);

      // Act
      const result = loadBaseline(tempDir, 'load-test');

      // Assert
      expect(result).toEqual(data);
    });

    // Requirement: Loading a non-existent baseline should return null
    // Case: error
    // Invariant: must return null, not throw
    it('returns null for a non-existent snapshot', () => {
      // Act
      const result = loadBaseline(tempDir, 'does-not-exist');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('baselineExists', () => {
    // Requirement: Check whether a baseline snapshot file exists on disk
    // Case: happy-path
    // Invariant: true when file present, false when absent
    it('returns true when the baseline file exists', () => {
      // Arrange
      saveBaseline(tempDir, 'exists-test', createTestPng());

      // Act & Assert
      expect(baselineExists(tempDir, 'exists-test')).toBe(true);
    });

    it('returns false when the baseline file does not exist', () => {
      // Act & Assert
      expect(baselineExists(tempDir, 'nope')).toBe(false);
    });
  });

  describe('saveDiffOutput', () => {
    // Requirement: Save a diff image to a __diff_output__ subdirectory
    // Case: happy-path
    // Invariant: file must be written to __diff_output__ with correct naming
    it('saves diff image to __diff_output__ subdirectory', () => {
      // Arrange
      const diffData = createTestPng();

      // Act
      const result = saveDiffOutput(tempDir, 'my-diff', diffData);

      // Assert
      expect(result).toBe(path.join(tempDir, '__diff_output__', 'my-diff.png'));
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result)).toEqual(diffData);
    });

    // Requirement: saveDiffOutput should create __diff_output__ if it does not exist
    // Case: boundary
    // Invariant: directory auto-creation
    it('creates the __diff_output__ directory if needed', () => {
      // Arrange
      const diffData = createTestPng();

      // Act
      const result = saveDiffOutput(tempDir, 'auto-dir', diffData);

      // Assert
      expect(fs.existsSync(path.join(tempDir, '__diff_output__'))).toBe(true);
      expect(fs.existsSync(result)).toBe(true);
    });
  });
});
