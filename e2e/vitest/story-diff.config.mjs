export default {
  storybookUrl: 'http://localhost:6006',
  snapshotsDir: '../snapshots/vitest-auto',
  failOnMissingBaseline: false,
  logger: {
    level: process.env.LOG_LEVEL ?? 'silent',
  },
  browser: {
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
