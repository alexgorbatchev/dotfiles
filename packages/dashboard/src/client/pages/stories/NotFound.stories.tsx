import type { Meta, StoryObj } from "@storybook/preact";

import { NotFound } from "../NotFound";

const meta: Meta<typeof NotFound> = {
  title: "client/pages/NotFound",
  component: NotFound,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <NotFound />,
  play: async () => {},
};

export default meta;
export { Default as NotFound };
