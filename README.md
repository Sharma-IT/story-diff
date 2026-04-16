# Story Diff

Test-framework-agnostic visual regression and snapshot testing for Storybook components using Puppeteer.

Story Diff enables you to capture screenshots of your Storybook stories and compare them against baselines, regardless of whether you use **Vitest**, **Jest**, or any other test runner.

It leverages `puppeteer` to load the stories, and a combination of `pixelmatch` & `pngjs` for the image comparison.

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

## First Run & Updating Baselines

On the **first run**, Story Diff will automatically create baseline PNGs in your `snapshotsDir`. 

If your components deliberately change, you can update existing baselines by setting the `update` flag in config to `true` (e.g. controlled via an environment variable).

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

  // Optional: Force overwrite valid baselines
  update?: boolean;
};
```
