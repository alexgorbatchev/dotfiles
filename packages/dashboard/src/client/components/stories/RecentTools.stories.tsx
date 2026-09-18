import type { Meta, StoryObj } from "@storybook/preact";

import { RecentTools } from "../RecentTools";

const meta: Meta<typeof RecentTools> = {
  title: "@dotfiles/dashboard/client/components/RecentTools",
  component: RecentTools,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <RecentTools />,
};

export default meta;
export { Default as RecentTools };
