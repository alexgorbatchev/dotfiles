import type { Meta, StoryObj } from "@storybook/preact";

import { Tools } from "../Tools";

const meta: Meta<typeof Tools> = {
  title: "dashboard/pages/Tools",
  component: Tools,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Tools />,
  play: async () => {},
};

export default meta;
export { Default as Tools };
