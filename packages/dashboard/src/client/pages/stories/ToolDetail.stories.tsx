import type { Meta, StoryObj } from "@storybook/preact";

import { ToolDetail } from "../ToolDetail";

const meta: Meta<typeof ToolDetail> = {
  title: "dashboard/pages/ToolDetail",
  component: ToolDetail,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ToolDetail params={{ name: "fzf" }} />,
  play: async () => {},
};

export { meta as default, Default as ToolDetail };
