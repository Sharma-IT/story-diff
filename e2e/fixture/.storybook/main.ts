import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  async viteFinal(config) {
    config.resolve ??= {};
    const existingDedupe = Array.isArray(config.resolve.dedupe) ? config.resolve.dedupe : [];
    config.resolve.dedupe = Array.from(new Set([...existingDedupe, 'react', 'react-dom']));
    return config;
  },
};
export default config;
