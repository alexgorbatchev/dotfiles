import type { Meta, StoryObj } from "@storybook/preact";

import { Health } from "../Health";

const meta: Meta<typeof Health> = {
  title: "@dotfiles/dashboard/client/templates/Health",
  component: Health,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Health />,
};

export default meta;
export { Default as Health };
