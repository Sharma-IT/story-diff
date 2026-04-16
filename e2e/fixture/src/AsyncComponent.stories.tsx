import type { Meta, StoryObj } from '@storybook/react';
import { AsyncComponent } from './AsyncComponent';

const meta = {
  title: 'Components/AsyncComponent',
  component: AsyncComponent,
} satisfies Meta<typeof AsyncComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    delay: 1500,
  },
};

export const Fast: Story = {
  args: {
    delay: 500,
  },
};
