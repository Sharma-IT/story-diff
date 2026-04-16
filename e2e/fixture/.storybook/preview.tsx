import React from 'react';
import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    layout: 'padded',
  },
  // Ensure we have a global that our E2E tests can use to test globals passing
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: ['light', 'dark'],
      },
    },
  },
  decorators: [
    (Story, context) => {
      // Add a data attribute to the root matching the theme from globals
      const theme = context.globals.theme || 'light';
      return (
        <div data-theme={theme} style={{ padding: '20px' }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
