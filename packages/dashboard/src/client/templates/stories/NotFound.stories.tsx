import type { Meta, StoryObj } from "@storybook/preact";

import { NotFound } from "../NotFound";

const meta: Meta<typeof NotFound> = {
  title: "@dotfiles/dashboard/client/templates/NotFound",
  component: NotFound,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <NotFound />,
};

export default meta;
export { Default as NotFound };
