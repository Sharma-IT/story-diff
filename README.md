<div align="center">

# Story Diff

<img width="442" height="442" alt="ChatGPT Image Apr 16, 2026, 01_15_11 PM" src="https://github.com/user-attachments/assets/2fb90381-8548-430a-975b-ed36b325529c" />

<br>

### The Completely Free, Open-Source Chromatic Alternative

[![npm version](https://img.shields.io/npm/v/story-diff.svg)](https://www.npmjs.com/package/story-diff)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Test-framework-agnostic visual regression and snapshot testing for Storybook components using Puppeteer or Playwright. Story Diff enables you to capture screenshots of your Storybook stories and compare them against baselines, regardless of whether you use **Vitest**, **Jest**, **Playwright Test**, or any other test runner. It uses either `puppeteer` or `playwright` to load the stories, and a combination of `pixelmatch` & `pngjs` for the image comparison.

</div>

<br>

## Installation

```bash
npm install --save-dev story-diff puppeteer
```

```bash
npm install --save-dev story-diff playwright @playwright/test
npx playwright install chromium
```

> **Requirements:**
>
> - Node.js 20 or higher
> - Storybook 10.0.0 or higher
> - Puppeteer 24.41.0 or higher
> - Playwright 1.59.1 or higher when using the Playwright provider

## Quick Start

Create a test file in your preferred testing framework (e.g., Vitest, Jest):

```typescript
// visual.test.ts
import { StoryDiff } from 'story-diff';

describe('Storybook Visual Regression', () => {
  let diff: StoryDiff;

  beforeAll(async () => {
    // 1. Initialize the StoryDiff instance
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: './visual-snapshots',
      browser: {
        provider: 'puppeteer',
      },
    });

    // 2. Launch browser and ensure Storybook is ready
    await diff.setup();
  }, 60000);

  afterAll(async () => {
    // 3. Clean up browser instances
    await diff.teardown();
  });

  // 4. Capture and assert single story
  it('matches Button primary baseline', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-desktop',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
  });

  // 5. Test globals/themes
  it('matches dark mode', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-dark',
      globals: { theme: 'dark' },
    });
    expect(result.match).toBe(true);
  });

  // 6. Test multiple stories declaratively in batch
  it('supports declarative batch execution', async () => {
    const results = await diff.runAll([
      {
        componentName: 'Button',
        storyPath: 'components-button',
        stories: ['primary', 'secondary'],
        viewports: ['mobile', 'desktop'],
      },
    ]);

    results.forEach((r) => {
      expect(r.result.match).toBe(true);
    });
  }, 60000);
});
```

### Playwright Test Example

```typescript
import { expect, test } from '@playwright/test';
import { StoryDiff } from 'story-diff';

test.describe('Storybook Visual Regression', () => {
  let diff: StoryDiff;

  test.beforeAll(async () => {
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: './visual-snapshots',
      browser: {
        provider: 'playwright',
        browserName: 'chromium',
      },
    });

    await diff.setup();
  });

  test.afterAll(async () => {
    await diff.teardown();
  });

  test('matches Button primary baseline', async () => {
    const result = await diff.assertMatchesBaseline('components-button--primary', {
      snapshotName: 'button-primary-desktop',
      viewport: 'desktop',
    });

    expect(result.match).toBe(true);
  });
});
```

### Running Tests

1. Ensure your Storybook server is running:

   ```bash
   npm run storybook
   ```

   **Tip:** To prevent Storybook from opening a browser window, use the `--no-open` flag:

   ```bash
   storybook dev -p 6006 --no-open
   ```

2. In a separate terminal, run your test framework:

   ```bash
   # Vitest
   vitest run visual.test.ts

   # Jest
   NODE_OPTIONS=--experimental-vm-modules jest visual.test.ts

   # Playwright Test
   playwright test visual.spec.ts
   ```

_Tip: For CI, use `wait-on` and `concurrently` to automate this. See [CI/CD Integration](#cicd-integration)._

## Core Concepts

### Story IDs

Story IDs follow Storybook's naming convention: `{path}--{story-name}`. For example:

- `components-button--primary`
- `pages-login--default`
- `ui-card--with-image`

You can find story IDs in your Storybook's URL or in the `index.json` file.

### Snapshot Naming

Snapshot names are used to identify baseline images on disk. They should be:

- Descriptive and unique
- Lowercase with hyphens
- Include viewport if testing multiple sizes

Examples:

- `button-primary-desktop`
- `card-with-image-mobile`
- `login-form-dark-mode`

### Viewports

Story Diff includes three default viewports:

- **mobile**: 393×852px
- **tablet**: 768×1024px
- **desktop**: 1440×900px

You can reference them by name or define custom viewports. See [Custom Viewports](#custom-viewports).

### Globals

Globals are Storybook's way of passing configuration to stories (e.g., theme, locale). Pass them via the `globals` option:

```typescript
await diff.assertMatchesBaseline('button--primary', {
  snapshotName: 'button-dark',
  globals: { theme: 'dark', locale: 'en-US' },
});
```

### Automatic Lifecycle Management

Story Diff can automatically handle the `beforeAll` and `afterAll` hooks to manage the browser lifecycle.

#### Using the Constructor

Pass `autoLifecycle: true` to the constructor. This will attempt to detect `beforeAll` and `afterAll` in the global scope (supported by Vitest and Jest).

```typescript
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  autoLifecycle: true,
});
```

#### Using the `hookLifecycle` Helper

If you prefer explicit registration or need to support environments without global hooks (like Playwright Test), use the `hookLifecycle` helper:

```typescript
import { test } from '@playwright/test';
import { StoryDiff, hookLifecycle } from 'story-diff';

const diff = new StoryDiff();

// Explicitly pass hooks for Playwright Test
hookLifecycle(diff, {
  enabled: true,
  beforeAll: test.beforeAll,
  afterAll: test.afterAll,
  timeout: 60000,
});
```

#### Configuration Options

```typescript
type LifecycleConfig = {
  enabled?: boolean; // Enable automatic management
  beforeAll?: HookFn; // Custom beforeAll implementation
  afterAll?: HookFn; // Custom afterAll implementation
  timeout?: number; // Timeout for hooks (default: 60000ms)
};
```

## API Reference

### StoryDiff Class

The main class for visual regression testing.

#### Constructor

```typescript
const diff = new StoryDiff(config?: StoryDiffConfig);
```

If you omit `config`, Story Diff searches upward from `process.cwd()` for one of these files and loads it automatically:

- `story-diff.config.mjs`
- `story-diff.config.js`
- `story-diff.config.cjs`
- `story-diff.config.json`
- `story-diff.mjs`
- `story-diff.js`
- `story-diff.cjs`
- `story-diff.json`

#### Lifecycle Methods

##### `setup()`

Launches the browser and verifies Storybook is ready.

```typescript
await diff.setup();
```

**Must be called before any capture or assertion methods.**

##### `teardown()`

Closes the browser and cleans up resources.

```typescript
await diff.teardown();
```

**Should be called in test cleanup (e.g., `afterAll`).**

### Configuration

#### `StoryDiffConfig`

```typescript
type StoryDiffConfig = {
  // Required: URL where Storybook is hosted
  storybookUrl: string;

  // Required: Directory path for baseline images
  snapshotsDir: string;

  // Optional: Custom viewport definitions
  viewports?: Record<string, Viewport>;

  // Optional: Browser automation configuration
  browser?: BrowserConfig;

  // Optional: Image comparison settings
  comparison?: ComparisonConfig;

  // Optional: Update mode (overwrites baselines)
  update?: boolean;

  // Optional: Fail when baseline is missing
  failOnMissingBaseline?: boolean;

  // Optional: Logger configuration
  logger?: LoggerConfig;

  // Optional: Default capture options applied to every call
  defaults?: CaptureOptions;

  // Optional: Batch definitions used when runAll() is called without arguments
  tests?: readonly StoryVisualTest[];
};
```

When loaded from a config file, `snapshotsDir` is resolved relative to that file.

#### `BrowserConfig`

```typescript
type BrowserConfig = {
  // Browser automation provider. Default: 'puppeteer'
  provider?: 'puppeteer' | 'playwright';

  // Playwright-only browser engine. Default: 'chromium'
  browserName?: 'chromium' | 'firefox' | 'webkit';

  // Playwright-only browser channel, e.g. 'chromium' or 'chrome'
  channel?: string;

  // Run browser in headless mode. Default: true
  headless?: boolean;

  // Extra browser launch args
  args?: readonly string[];

  // Launch timeout in ms
  timeout?: number;

  // Custom browser executable path
  executablePath?: string;
};
```

#### `LoggerConfig`

```typescript
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

type LoggerConfig = {
  // Logging level. Default: 'silent'
  level?: LogLevel;
  // Custom logger function. If not provided, uses console
  customLogger?: (level: LogLevel, message: string, ...args: unknown[]) => void;
};
```

#### `ComparisonConfig`

```typescript
type ComparisonConfig = {
  // Pixelmatch threshold (0-1). Lower = stricter. Default: 0.1
  threshold?: number;

  // Acceptable diff as percentage (0-100) or pixel count. Default: 0
  failureThreshold?: number;

  // Whether failureThreshold is 'percent' or 'pixel'. Default: 'percent'
  failureThresholdType?: 'percent' | 'pixel';

  // Allow size mismatches between actual and baseline. Default: false
  allowSizeMismatch?: boolean;
};
```

### Methods

#### `captureStory()`

Captures a screenshot of a story without comparison.

```typescript
const screenshot: Buffer = await diff.captureStory(
  storyId: string,
  options?: CaptureOptions
);
```

**Options:**

```typescript
type CaptureOptions = {
  viewport?: string | Viewport;
  globals?: Record<string, string>;
  waitForSelector?: string;
  waitForTimeout?: number;
};
```

#### `compareWithBaseline()`

Compares a screenshot buffer against a baseline.

```typescript
const result: ComparisonResult = await diff.compareWithBaseline(
  screenshot: Buffer,
  snapshotName: string,
  comparisonOverride?: ComparisonConfig
);
```

#### `assertMatchesBaseline()`

Captures a story and asserts it matches the baseline. Throws on mismatch.

```typescript
const result: ComparisonResult = await diff.assertMatchesBaseline(
  storyId: string,
  options: AssertOptions
);
```

**Options:**

```typescript
type AssertOptions = CaptureOptions & {
  snapshotName: string;
  comparison?: ComparisonConfig;
};
```

**Throws:**

- `BaselineMissingError` - When baseline doesn't exist and `failOnMissingBaseline` is true
- `VisualRegressionError` - When images differ beyond threshold
- `SizeMismatchError` - When dimensions differ and `allowSizeMismatch` is false

#### `updateBaseline()`

Saves a screenshot as a new baseline.

```typescript
const path: string = await diff.updateBaseline(
  screenshot: Buffer,
  snapshotName: string
);
```

#### `runAll()`

Batch processes multiple stories declaratively.

```typescript
const results: BatchResult[] = await diff.runAll(
  tests?: StoryVisualTest[]
);
```

**Input:**

```typescript
type StoryVisualTest = {
  componentName: string;
  storyPath: string;
  stories: readonly string[];
  viewports?: readonly string[];
  globals?: Record<string, string>;
};
```

**Output:**

```typescript
type BatchResult = {
  storyId: string;
  snapshotName: string;
  viewport: string;
  result: ComparisonResult;
};
```

### Type Definitions

#### `ComparisonResult`

```typescript
type ComparisonResult = {
  match: boolean;
  diffPixels: number;
  diffPercentage: number;
  diffImage: Buffer | null;
  baselineCreated: boolean;
  baselineMissing: boolean;
  snapshotPath: string;
  diffPath: string | null;
};
```

#### `Viewport`

```typescript
type Viewport = {
  name: string;
  width: number;
  height: number;
};
```

## Advanced Usage

### Logging Configuration

Control output verbosity with the logger configuration:

```typescript
// Default - silent mode (no output)
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  // logger is silent by default, no need to configure
});

// Info mode - recommended for development
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  logger: {
    level: 'info',
  },
});

// Error only
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  logger: {
    level: 'error',
  },
});

// Debug mode - verbose output
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  logger: {
    level: 'debug',
  },
});

// Custom logger (e.g., integrate with your logging framework)
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  logger: {
    level: 'info',
    customLogger: (level, message, ...args) => {
      // Send to your logging service
      myLogger.log({ level, message, args });
    },
  },
});
```

**Log Levels:**

- `silent`: No output (default)
- `error`: Only errors
- `warn`: Errors and warnings
- `info`: Errors, warnings, and informational messages
- `debug`: All messages including detailed debugging information

### Headless vs Headed Mode

By default, Story Diff runs the browser in headless mode. For debugging or E2E testing, you can run in headed mode:

```typescript
// Headed mode - see the browser window
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  browser: {
    headless: false,
  },
});

// Headless mode (default)
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  browser: {
    headless: true, // or omit this line
  },
});
```

**When to use headed mode:**

- Debugging test failures
- Developing new tests
- Demonstrating visual tests
- Internal E2E testing

**Note:** Headed mode is slower and requires a display. Always use headless mode in CI/CD environments.

**Environment Variable Control:**

You can control headless mode via environment variables:

```bash
# Run in headed mode for debugging
HEADLESS=false npm test

# Run in headless mode (default)
npm test
```

```typescript
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  browser: {
    headless: process.env.HEADLESS !== 'false',
  },
  logger: {
    level: (process.env.LOG_LEVEL as LogLevel) || 'silent',
  },
});
```

This allows you to easily switch between modes without changing code:

```bash
# Debug with headed browser and verbose logging
HEADLESS=false LOG_LEVEL=debug npm test

# CI mode with default silent logging
npm test

# Enable info logging for CI troubleshooting
LOG_LEVEL=info npm test
```

### Batch Testing

Test multiple stories and viewports efficiently:

```typescript
const results = await diff.runAll([
  {
    componentName: 'Button',
    storyPath: 'components-button',
    stories: ['primary', 'secondary', 'disabled'],
    viewports: ['mobile', 'tablet', 'desktop'],
  },
  {
    componentName: 'Card',
    storyPath: 'components-card',
    stories: ['default', 'with-image'],
    viewports: ['desktop'],
    globals: { theme: 'dark' },
  },
]);

// Generates snapshots like:
// - button-primary-mobile.png
// - button-primary-tablet.png
// - button-primary-desktop.png
// - button-secondary-mobile.png
// ... etc
```

### Custom Viewports

Define custom viewport sizes:

```typescript
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  viewports: {
    mobile: { name: 'mobile', width: 375, height: 667 },
    tablet: { name: 'tablet', width: 768, height: 1024 },
    desktop: { name: 'desktop', width: 1920, height: 1080 },
    '4k': { name: '4k', width: 3840, height: 2160 },
  },
});
```

Or pass inline viewports:

```typescript
await diff.assertMatchesBaseline('button--primary', {
  snapshotName: 'button-custom',
  viewport: { name: 'custom', width: 1024, height: 768 },
});
```

### Root Config File

If you want one global config object for the whole project, create a root config file and instantiate `StoryDiff` without passing config in your test hooks:

```javascript
// story-diff.config.mjs
export default {
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './visual-snapshots',
  failOnMissingBaseline: false,
  defaults: {
    viewport: 'desktop',
    globals: {
      theme: 'dark',
      locale: 'en-AU',
    },
    waitForSelector: '#storybook-root',
    waitForTimeout: 300,
  },
  tests: [
    {
      componentName: 'Button',
      storyPath: 'components-button',
      stories: ['primary', 'secondary'],
      viewports: ['mobile', 'desktop'],
    },
  ],
};
```

```typescript
import { StoryDiff } from 'story-diff';

const diff = new StoryDiff();

beforeAll(async () => {
  await diff.setup();
});

afterAll(async () => {
  await diff.teardown();
});

it('uses discovered defaults automatically', async () => {
  const result = await diff.assertMatchesBaseline('components-button--primary', {
    snapshotName: 'button-primary-dark',
  });

  expect(result.match).toBe(true);
});

it('can use configured batch tests without redefining them', async () => {
  const results = await diff.runAll();
  expect(results).toHaveLength(4);
});
```

### Comparison Thresholds

Fine-tune sensitivity to visual changes:

```typescript
// Global configuration
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  comparison: {
    threshold: 0.05, // Stricter pixel matching
    failureThreshold: 0.5, // Allow 0.5% difference
    failureThresholdType: 'percent',
  },
});

// Per-assertion override
await diff.assertMatchesBaseline('button--primary', {
  snapshotName: 'button',
  comparison: {
    threshold: 0.2, // More lenient for this test
    failureThreshold: 100, // Allow 100 pixels difference
    failureThresholdType: 'pixel',
  },
});
```

### Async Components

Wait for async content to load before capturing:

```typescript
// Wait for a specific element
await diff.assertMatchesBaseline('async-component--default', {
  snapshotName: 'async-loaded',
  waitForSelector: '#data-loaded',
});

// Wait for a fixed duration
await diff.assertMatchesBaseline('animated-component--default', {
  snapshotName: 'animation-complete',
  waitForTimeout: 2000, // 2 seconds
});
```

### CI/CD Integration

#### Using `concurrently` and `wait-on`

For local development and CI, use these tools to automate Storybook startup:

```json
{
  "scripts": {
    "test:visual": "concurrently -k -s first \"npm run storybook -- --ci\" \"wait-on http://localhost:6006 && vitest run visual.test.ts\""
  }
}
```

#### GitHub Actions Example

```yaml
name: Visual Regression Tests

on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build Storybook
        run: npm run build-storybook

      - name: Run visual tests
        run: npm run test:visual

      - name: Upload diff images
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: visual-diffs
          path: ./visual-snapshots/*-diff.png
```

## Error Handling

Story Diff provides custom error classes for robust error handling:

```typescript
import {
  VisualRegressionError,
  BaselineMissingError,
  SizeMismatchError,
  NotInitializedError,
  StorybookConnectionError,
  ViewportNotFoundError,
} from 'story-diff';

try {
  await diff.assertMatchesBaseline('button--primary', {
    snapshotName: 'btn',
  });
} catch (e) {
  if (e instanceof VisualRegressionError) {
    console.log(`Visual diff detected: ${e.diffPercentage}%`);
    console.log(`Diff image: ${e.diffPath}`);
  } else if (e instanceof BaselineMissingError) {
    console.log(`Baseline missing: ${e.snapshotPath}`);
  } else if (e instanceof SizeMismatchError) {
    console.error('Snapshot dimensions have changed!');
  } else if (e instanceof NotInitializedError) {
    console.error('Call setup() before using StoryDiff');
  } else if (e instanceof StorybookConnectionError) {
    console.error('Cannot connect to Storybook');
  } else if (e instanceof ViewportNotFoundError) {
    console.error('Unknown viewport name');
  }
}
```

### Error Types

| Error                      | When Thrown                                                 | Properties                                                                 |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `VisualRegressionError`    | Images differ beyond threshold                              | `snapshotName`, `diffPercentage`, `diffPixels`, `snapshotPath`, `diffPath` |
| `BaselineMissingError`     | Baseline doesn't exist (when `failOnMissingBaseline: true`) | `snapshotName`, `snapshotPath`                                             |
| `SizeMismatchError`        | Image dimensions differ (when `allowSizeMismatch: false`)   | -                                                                          |
| `NotInitializedError`      | Methods called before `setup()`                             | -                                                                          |
| `StorybookConnectionError` | Cannot reach Storybook server                               | -                                                                          |
| `ViewportNotFoundError`    | Unknown viewport name used                                  | -                                                                          |

## Baseline Management

### Creating Baselines

On first run, baselines must be created. There are two approaches:

#### 1. Explicit Update Mode (Recommended)

```bash
UPDATE_SNAPSHOTS=true npm test
```

```typescript
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  update: process.env.UPDATE_SNAPSHOTS === 'true',
});
```

#### 2. Silent Creation Mode

```typescript
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './snapshots',
  failOnMissingBaseline: false, // Creates baselines silently
});
```

### Updating Baselines

When components change intentionally, update baselines:

```bash
UPDATE_SNAPSHOTS=true npm test
```

Or update specific tests:

```bash
UPDATE_SNAPSHOTS=true npm test -- button.test.ts
```

### Baseline Storage

Baselines are stored as PNG files in your `snapshotsDir`:

```
visual-snapshots/
├── button-primary-desktop.png
├── button-primary-mobile.png
├── button-secondary-desktop.png
└── card-default-desktop.png
```

Diff images (on failure) are saved with `-diff` suffix:

```
visual-snapshots/
├── button-primary-desktop.png
└── button-primary-desktop-diff.png  ← Generated on mismatch
```

**Commit baselines to version control** to track visual changes over time.

## Testing Frameworks

### Vitest

Vitest is the recommended framework for its speed and ESM support.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

```typescript
// visual.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StoryDiff } from 'story-diff';

describe('Visual Regression', () => {
  let diff: StoryDiff;

  beforeAll(async () => {
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: './snapshots',
    });
    await diff.setup();
  }, 60000);

  afterAll(async () => {
    await diff.teardown();
  });

  it('matches baseline', async () => {
    const result = await diff.assertMatchesBaseline('button--primary', {
      snapshotName: 'button-primary',
    });
    expect(result.match).toBe(true);
  });
});
```

### Jest

Jest requires experimental VM modules for ESM support.

```typescript
// jest.config.ts
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testTimeout: 60000,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
```

Run with:

```bash
NODE_OPTIONS=--experimental-vm-modules jest
```

### Other Frameworks

Story Diff works with any test framework that supports async/await:

- Mocha
- Ava
- Tape
- Node's built-in test runner

## Troubleshooting

### Storybook Connection Errors

**Problem:** `StorybookConnectionError: Failed to connect to Storybook`

**Solutions:**

- Ensure Storybook is running: `npm run storybook`
- Verify the URL is correct (default: `http://localhost:6006`)
- Check firewall/network settings
- Increase browser timeout:
  ```typescript
  browser: {
    timeout: 60000;
  }
  ```

### Flaky Tests

**Problem:** Tests pass sometimes, fail other times

**Solutions:**

- Use `waitForSelector` for async content
- Increase `waitForTimeout` for animations
- Disable animations in Storybook preview:
  ```typescript
  // .storybook/preview.ts
  export const parameters = {
    chromatic: { disableSnapshot: false },
    // Disable animations
    layout: 'fullscreen',
  };
  ```
- Adjust `failureThreshold` to allow minor differences

### Size Mismatch Errors

**Problem:** `SizeMismatchError: Image size mismatch`

**Solutions:**

- Component dimensions changed - update baseline
- Viewport changed - ensure consistent viewport usage
- Allow size mismatches temporarily:
  ```typescript
  comparison: {
    allowSizeMismatch: true;
  }
  ```

### Memory Issues

**Problem:** Tests crash with out-of-memory errors

**Solutions:**

- Close browser between test suites
- Reduce concurrent tests
- Increase Node memory:
  ```bash
  NODE_OPTIONS=--max-old-space-size=4096 npm test
  ```

### Puppeteer Installation Issues

**Problem:** Puppeteer fails to install or launch

**Solutions:**

- Install system dependencies (Linux):
  ```bash
  sudo apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libasound2
  ```
- Use custom Chrome path:
  ```typescript
  browser: {
    executablePath: '/usr/bin/google-chrome';
  }
  ```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with tests
4. Run tests: `npm test`
5. Run E2E tests: `npm run test:e2e`
6. Commit with conventional commits: `feat: add new feature`
7. Push and create a pull request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/story-diff.git
cd story-diff

# Install dependencies
npm install

# Build the library
npm run build

# Run unit tests
npm test

# Run E2E tests (requires Storybook)
npm run test:e2e

# Type checking
npm run typecheck
```

## License

MIT License - Copyright (c) 2026 Shubham Sharma

See [LICENSE](LICENSE) for full details.
