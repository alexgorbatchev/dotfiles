import type { Meta, StoryObj } from "@storybook/preact";

import type { IUseToolActions } from "../../hooks/useToolActions";
import { ToolActionButtons } from "../ToolActionButtons";

const meta: Meta<typeof ToolActionButtons> = {
  title: "@dotfiles/dashboard/client/components/ToolActionButtons",
  component: ToolActionButtons,
};

type Story = StoryObj<typeof meta>;

const idleActions: IUseToolActions = {
  pending: null,
  outcome: null,
  installTool: async () => {},
  updateTool: async () => {},
  checkTool: async () => {},
};

const checkingActions: IUseToolActions = {
  ...idleActions,
  pending: { toolName: "eza", kind: "check" },
};

const Default: Story = {
  render: () => (
    <div class="space-y-3">
      <ToolActionButtons toolName="eza" isInstalled actions={idleActions} size="sm" />
      <ToolActionButtons toolName="bat" isInstalled={false} actions={idleActions} size="sm" />
      <ToolActionButtons toolName="eza" isInstalled actions={checkingActions} size="xs" />
      <ToolActionButtons toolName="bat" isInstalled={false} actions={idleActions} size="xs" />
    </div>
  ),
  play: async () => {},
};

export default meta;
export { Default as ToolActionButtons };
