import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConfigNotFoundError, InvalidConfigError } from './errors.js';
import type { StoryDiffConfig } from './story-diff.types.js';
import { isRecord } from './utils.js';

const SUPPORTED_CONFIG_FILES = [
  'story-diff.config.mjs',
  'story-diff.config.js',
  'story-diff.config.cjs',
  'story-diff.config.json',
  'story-diff.mjs',
  'story-diff.js',
  'story-diff.cjs',
  'story-diff.json',
] as const;

export async function resolveStoryDiffConfig(config?: StoryDiffConfig): Promise<StoryDiffConfig> {
  if (config?.storybookUrl && config.snapshotsDir) {
    return config;
  }

  return loadDiscoveredStoryDiffConfig(config?.cwd);
}

async function loadDiscoveredStoryDiffConfig(cwd?: string): Promise<StoryDiffConfig> {
  const configPath = findStoryDiffConfig(cwd ?? process.cwd());

  if (!configPath) {
    throw new ConfigNotFoundError(SUPPORTED_CONFIG_FILES);
  }

  const loadedConfig = await loadConfigFile(configPath);
  return normaliseConfig(loadedConfig, configPath);
}

function findStoryDiffConfig(startDirectory: string): string | null {
  const getSearchDirectories = (dir: string): readonly string[] => {
    const resolveParents = (current: string, acc: readonly string[]): readonly string[] => {
      const parent = path.dirname(current);
      return parent === current ? [...acc, current] : resolveParents(parent, [...acc, current]);
    };
    return resolveParents(path.resolve(dir), []);
  };

  const searchDirectories = getSearchDirectories(startDirectory);

  for (const currentDirectory of searchDirectories) {
    for (const fileName of SUPPORTED_CONFIG_FILES) {
      const candidatePath = path.join(currentDirectory, fileName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

async function loadConfigFile(filePath: string): Promise<unknown> {
  if (filePath.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const importedConfig = (await import(pathToFileURL(filePath).href)) as Record<string, unknown>;
  return importedConfig.default ?? importedConfig;
}

function normaliseConfig(configValue: unknown, filePath: string): StoryDiffConfig {
  if (!isRecord(configValue)) {
    throw new InvalidConfigError(filePath, 'expected the config file to export an object');
  }

  const storybookUrl = configValue.storybookUrl;
  const snapshotsDir = configValue.snapshotsDir;

  if (typeof storybookUrl !== 'string' || storybookUrl.length === 0) {
    throw new InvalidConfigError(filePath, '"storybookUrl" must be a non-empty string');
  }

  if (typeof snapshotsDir !== 'string' || snapshotsDir.length === 0) {
    throw new InvalidConfigError(filePath, '"snapshotsDir" must be a non-empty string');
  }

  const resolvedSnapshotsDir = path.isAbsolute(snapshotsDir)
    ? snapshotsDir
    : path.resolve(path.dirname(filePath), snapshotsDir);

  return {
    ...configValue,
    storybookUrl,
    snapshotsDir: resolvedSnapshotsDir,
  };
}
