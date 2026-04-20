import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('node:fs');

describe('resolveStoryDiffConfig', () => {
  let resolveStoryDiffConfig: any;
  let InvalidConfigError: any;
  let ConfigNotFoundError: any;

  beforeEach(async () => {
    vi.resetModules();
    const configLoader = await import('../config-loader.js');
    resolveStoryDiffConfig = configLoader.resolveStoryDiffConfig;
    
    const errors = await import('../errors.js');
    InvalidConfigError = errors.InvalidConfigError;
    ConfigNotFoundError = errors.ConfigNotFoundError;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns directly provided config', async () => {
    const config = { storybookUrl: 'http://localhost', snapshotsDir: '/tmp' };
    const result = await resolveStoryDiffConfig(config);
    expect(result).toBe(config);
  });

  it('throws InvalidConfigError if storybookUrl is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ snapshotsDir: '/tmp' }));
    
    // We expect the first call to fail
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });

  it('throws InvalidConfigError if snapshotsDir is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ storybookUrl: 'http://localhost' }));
    
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });

  it('resolves snapshotsDir relative to config file if not absolute', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ 
      storybookUrl: 'http://localhost',
      snapshotsDir: 'relative-dir'
    }));
    
    const result = await resolveStoryDiffConfig();
    expect(result.snapshotsDir).toMatch(/relative-dir$/);
    expect(path.isAbsolute(result.snapshotsDir)).toBe(true);
  });

  it('throws InvalidConfigError if config is not an object', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(null));
    
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });

  it('throws ConfigNotFoundError when traversing to root without finding it', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    await expect(resolveStoryDiffConfig()).rejects.toThrow(ConfigNotFoundError);
  });

  it('handles JS configs without default export', async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // We just write to the active real disk, mkdtemp expects a valid string
    const tempDir = realFs.mkdtempSync(path.join(process.cwd(), 'cfg-test-'));
    const tempFile = path.join(tempDir, 'story-diff.config.mjs');
    realFs.writeFileSync(tempFile, `export const storybookUrl = "http://a"; export const snapshotsDir = "b";`);
    
    // Temporarily disable the fs existsSync mock so the physical file is checked!
    (fs.existsSync as any).mockImplementation((p: string) => realFs.existsSync(p));
    // We don't need cwdSpy if we pass { cwd: tempDir }
    
    try {
      const config = await resolveStoryDiffConfig({ cwd: tempDir });
      expect(config.storybookUrl).toBe("http://a");
    } finally {
      (fs.existsSync as any).mockRestore();
      realFs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves config from parent directory with deep nesting', async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const rootDir = realFs.mkdtempSync(path.join(process.cwd(), 'cfg-root-'));
    const subDir = path.join(rootDir, 'nested', 'deep', 'inner');
    realFs.mkdirSync(path.join(rootDir, 'nested'), { recursive: true });
    realFs.mkdirSync(path.join(rootDir, 'nested', 'deep'), { recursive: true });
    realFs.mkdirSync(subDir, { recursive: true });
    
    realFs.writeFileSync(path.join(rootDir, 'story-diff.json'), JSON.stringify({ 
      storybookUrl: 'http://parent',
      snapshotsDir: 'snaps'
    }));

    vi.spyOn(fs, 'existsSync').mockImplementation((p: string) => realFs.existsSync(p));
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, o: any) => realFs.readFileSync(p, o));

    try {
      const config = await resolveStoryDiffConfig({ cwd: subDir });
      expect(config.storybookUrl).toBe('http://parent');
    } finally {
      (fs.existsSync as any).mockRestore();
      (fs.readFileSync as any).mockRestore();
      realFs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('prefers provided config over discovery', async () => {
    const provided = { storybookUrl: 'http://provided', snapshotsDir: '/snaps' };
    const result = await resolveStoryDiffConfig(provided);
    expect(result.storybookUrl).toBe('http://provided');
  });

  it('includes precise error detail in InvalidConfigError when config is not an object', async () => {
    // Requirement: error detail must be 'expected the config file to export an object' (not empty)
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(null));
    await expect(resolveStoryDiffConfig()).rejects.toThrow('expected the config file to export an object');
  });

  it('includes precise error detail when storybookUrl is missing or empty', async () => {
    // Requirement: error detail must be '"storybookUrl" must be a non-empty string' (not empty)
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ snapshotsDir: '/tmp' }));
    await expect(resolveStoryDiffConfig()).rejects.toThrow('"storybookUrl" must be a non-empty string');
  });

  it('includes precise error detail when snapshotsDir is missing or empty', async () => {
    // Requirement: error detail must be '"snapshotsDir" must be a non-empty string' (not empty)
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ storybookUrl: 'http://localhost' }));
    await expect(resolveStoryDiffConfig()).rejects.toThrow('"snapshotsDir" must be a non-empty string');
  });

  it('throws InvalidConfigError when storybookUrl is an empty string (length===0 boundary)', async () => {
    // Requirement: condition uses || storybookUrl.length === 0 (not || false)
    // Case: boundary — empty string passes typeof check but fails length check
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ storybookUrl: '', snapshotsDir: '/tmp' }));
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });

  it('throws InvalidConfigError when snapshotsDir is an empty string (length===0 boundary)', async () => {
    // Requirement: condition uses || snapshotsDir.length === 0 (not || false)
    // Case: boundary — empty string passes typeof check but fails length check
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ storybookUrl: 'http://localhost', snapshotsDir: '' }));
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });

  it('throws InvalidConfigError if config is an array (isRecord returns false for arrays)', async () => {
    // Requirement: isRecord must reject arrays (typeof [] === 'object' but Array.isArray is true)
    // If the typeof check were replaced with true, arrays would pass the first check
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(['storybookUrl', 'snapshotsDir']));
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });

  it('throws InvalidConfigError if config value is a number (not an object)', async () => {
    // Requirement: typeof check in isRecord must exclude non-objects
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('story-diff.json'));
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(42));
    await expect(resolveStoryDiffConfig()).rejects.toThrow(InvalidConfigError);
  });
});
