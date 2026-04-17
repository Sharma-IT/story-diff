export default {
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: '../snapshots/playwright-auto',
  failOnMissingBaseline: false,
  logger: {
    level: process.env.LOG_LEVEL ?? 'silent',
  },
  browser: {
    provider: 'playwright',
    browserName: 'chromium',
    headless: process.env.HEADLESS !== 'false',
  },
  defaults: {
    viewport: 'desktop',
    globals: {
      theme: 'dark',
    },
  },
  tests: [
    {
      componentName: 'Button',
      storyPath: 'components-button',
      stories: ['secondary'],
      viewports: ['mobile'],
    },
  ],
};
