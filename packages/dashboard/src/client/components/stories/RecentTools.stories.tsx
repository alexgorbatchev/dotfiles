import type { Meta, StoryObj } from "@storybook/preact";

import { RecentTools } from "../RecentTools";

const meta: Meta<typeof RecentTools> = {
  title: "dashboard/components/RecentTools",
  component: RecentTools,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <RecentTools />,
  play: async () => {},
};

export { meta as default, Default as RecentTools };
