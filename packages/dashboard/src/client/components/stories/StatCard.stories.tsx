import type { Meta, StoryObj } from "@storybook/preact";

import { StatCard } from "../StatCard";

const meta: Meta<typeof StatCard> = {
  title: "@dotfiles/dashboard/client/components/StatCard",
  component: StatCard,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <StatCard value={42} label="Installed" color="text-green-400" />,
  play: async () => {},
};

export default meta;
export { Default as StatCard };
