<div align="center">

# Story Diff

<img width="442" height="398" alt="logo" src="https://github.com/user-attachments/assets/4726057a-1472-40e4-b6c6-92f47bbc435e" />

<br>

### The Completely Free, Open-Source Chromatic Alternative

</div>

<br>

Test-framework-agnostic visual regression and snapshot testing for Storybook components using Puppeteer. Story Diff enables you to capture screenshots of your Storybook stories and compare them against baselines, regardless of whether you use **Vitest**, **Jest**, or any other test runner. It leverages `puppeteer` to load the stories, and a combination of `pixelmatch` & `pngjs` for the image comparison.

## Installation

```bash
npm install --save-dev story-diff puppeteer
```

> **Note:** Story Diff requires `storybook` (^10.0.0) and `puppeteer` (^24.0.0) as peer dependencies.

## Quick Start

Create a test file in your preferred testing framework (e.g., Vitest, Jest):

```typescript
// visual.test.ts
import { StoryDiff } from 'story-diff';

describe('Storybook Visual Regression', () => {
  let diff: StoryDiff;

  beforeAll(async () => {
    // 1. Initialise the StoryDiff instance
    diff = new StoryDiff({
      storybookUrl: 'http://localhost:6006',
      snapshotsDir: './visual-snapshots',
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

## Running Tests

1. Ensure your Storybook server is running:
   ```bash
   npm run storybook
   ```
2. In a separate terminal, run your test framework:
   ```bash
   # Vitest
   vitest run visual.test.ts
   
   # Jest
   NODE_OPTIONS=--experimental-vm-modules jest visual.test.ts
   ```

*Tip: For CI, use `wait-on` and `concurrently` to script this effectively.*

## Error Handling

Story Diff provides custom error classes for robust error handling in your test suites:

```typescript
import { 
  VisualRegressionError, 
  BaselineMissingError,
  SizeMismatchError, 
  NotInitializedError 
} from 'story-diff';

try {
  await diff.assertMatchesBaseline('button--primary', { snapshotName: 'btn' });
} catch (e) {
  if (e instanceof VisualRegressionError) {
    console.log(`Diff: ${e.diffPercentage}%`);
    console.log(`Diff image saved at: ${e.diffPath}`);
  } else if (e instanceof SizeMismatchError) {
    console.error('Snapshot dimensions have changed!');
  }
}
```

Notable errors include:
- `VisualRegressionError`: Thrown when pixel comparison exceeds the threshold.
- `BaselineMissingError`: Thrown when a baseline image is expected but not found on disk.
- `SizeMismatchError`: Thrown when new snapshot dimensions don't match the baseline.
- `StorybookConnectionError`: Thrown when the Storybook server is unreachable or fails to load.
- `NotInitializedError`: Thrown if methods are called before `await diff.setup()`.

## First Run & Updating Baselines

By default, Story Diff expects baseline PNGs to exist in your `snapshotsDir`. If a baseline is missing, the test will fail with a `BaselineMissingError`. This prevents "silent" baseline creation during CI or development.

To create initial baselines or update existing ones, set the `update` flag in config to `true`.

```typescript
const diff = new StoryDiff({
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: './visual-snapshots',
  update: process.env.UPDATE_SNAPSHOTS === 'true'
});
```

## Configuration

The `StoryDiff` constructor accepts `StoryDiffConfig`:

```typescript
type StoryDiffConfig = {
  // Required URL where Storybook is hosted locally or remotely
  storybookUrl: string;
  // Required path to load/save PNG baselines
  snapshotsDir: string;
  
  // Optional: Global viewport definitions (overridable per assertion)
  // Defaults to mobile (393px), tablet (768px), desktop (1440px)
  viewports?: Record<string, Viewport>;
  
  // Optional: Puppeteer launch arguments
  browser?: {
    headless?: boolean;
    args?: readonly string[];
    timeout?: number;
    executablePath?: string;
  };
  
  // Optional: pixelmatch configuration
  comparison?: {
    threshold?: number;           // Defaults: 0.1
    failureThreshold?: number;    // Defaults: 0
    failureThresholdType?: 'percent' | 'pixel';
    allowSizeMismatch?: boolean;  // Defaults: false
  };

  // Optional: Force overwrite or create new baselines. Default: false
  update?: boolean;
  // Optional: Fail when baseline is missing. Default: true
  failOnMissingBaseline?: boolean;
};
```

### Overriding Comparison Config

You can also override the `comparison` configuration for a specific assertion:

```typescript
});
```
