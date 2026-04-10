import type { Meta, StoryObj } from "@storybook/preact";

import { Health } from "../Health";

const meta: Meta<typeof Health> = {
  title: "client/pages/Health",
  component: Health,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Health />,
  play: async () => {},
};

export default meta;
export { Default as Health };
