import type { Meta, StoryObj } from "@storybook/preact";

import { Health } from "../Health";

const meta: Meta<typeof Health> = {
  title: "dashboard/pages/Health",
  component: Health,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Health />,
  play: async () => {},
};

export { meta as default, Default as Health };
