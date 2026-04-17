import type { Meta, StoryObj } from "@storybook/preact";

import { ToolDetail } from "../ToolDetail";

const meta: Meta<typeof ToolDetail> = {
  title: "@dotfiles/dashboard/client/pages/ToolDetail",
  component: ToolDetail,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ToolDetail params={{ name: "fzf" }} />,
  play: async () => {},
};

export default meta;
export { Default as ToolDetail };
