import type { Meta, StoryObj } from "@storybook/preact";

import { ToolActionsProvider } from "../ToolActionsProvider";

const meta: Meta<typeof ToolActionsProvider> = {
  title: "@dotfiles/dashboard/client/components/ToolActionsProvider",
  component: ToolActionsProvider,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;
const Default: Story = {
  render: () => (
    <ToolActionsProvider>
      <p>The operation panel appears when an action starts.</p>
    </ToolActionsProvider>
  ),
};

export default meta;
export { Default as ToolActionsProvider };
