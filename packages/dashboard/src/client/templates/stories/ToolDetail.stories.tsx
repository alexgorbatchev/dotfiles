import type { Meta, StoryObj } from "@storybook/preact";

import { ToolActionsProvider } from "../../components/ToolActionsProvider";
import { ToolDetail } from "../ToolDetail";

const meta: Meta<typeof ToolDetail> = {
  title: "@dotfiles/dashboard/client/templates/ToolDetail",
  component: ToolDetail,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <ToolActionsProvider>
      <ToolDetail params={{ name: "fzf" }} />
    </ToolActionsProvider>
  ),
};

export default meta;
export { Default as ToolDetail };
