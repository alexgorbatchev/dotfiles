import type { Meta, StoryObj } from "@storybook/preact";

import { ToolDetail } from "../ToolDetail";

const meta: Meta<typeof ToolDetail> = {
  title: "@dotfiles/dashboard/client/templates/ToolDetail",
  component: ToolDetail,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ToolDetail params={{ name: "fzf" }} />,
};

export default meta;
export { Default as ToolDetail };
