import type { Meta, StoryObj } from "@storybook/preact";

import { Tools } from "../Tools";

const meta: Meta<typeof Tools> = {
  title: "@dotfiles/dashboard/client/templates/Tools",
  component: Tools,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Tools />,
};

export default meta;
export { Default as Tools };
