import type { Meta, StoryObj } from "@storybook/preact";

import { StatusBadge } from "../StatusBadge";

const meta: Meta<typeof StatusBadge> = {
  title: "client/components/StatusBadge",
  component: StatusBadge,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <StatusBadge status="installed" />,
  play: async () => {},
};

export default meta;
export { Default as StatusBadge };
