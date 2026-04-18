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
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    
    try {
      const config = await resolveStoryDiffConfig();
      expect(config.storybookUrl).toBe("http://a");
    } finally {
      cwdSpy.mockRestore();
      (fs.existsSync as any).mockRestore();
      realFs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
