import type { Meta, StoryObj } from "@storybook/preact";

import { Settings } from "../Settings";

const meta: Meta<typeof Settings> = {
  title: "dashboard/pages/Settings",
  component: Settings,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Settings />,
  play: async () => {},
};

export default meta;
export { Default as Settings };
