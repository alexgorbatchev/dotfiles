import type { Meta, StoryObj } from "@storybook/preact";

import { Settings } from "../Settings";

const meta: Meta<typeof Settings> = {
  title: "@dotfiles/dashboard/client/templates/Settings",
  component: Settings,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Settings />,
};

export default meta;
export { Default as Settings };
