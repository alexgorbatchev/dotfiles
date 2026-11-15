import type { Meta, StoryObj } from "@storybook/preact";

import { ToolActionButtons } from "../ToolActionButtons";
import { fixture_idleActions, fixture_pendingActions } from "./fixtures";

const meta: Meta<typeof ToolActionButtons> = {
  title: "@dotfiles/dashboard/client/components/ToolActionButtons",
  component: ToolActionButtons,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

export const Installed: Story = {
  render: () => <ToolActionButtons toolName="bat" isInstalled actions={fixture_idleActions} size="sm" />,
};
export const NotInstalled: Story = {
  render: () => <ToolActionButtons toolName="bat" isInstalled={false} actions={fixture_idleActions} size="sm" />,
};
export const Compact: Story = {
  render: () => <ToolActionButtons toolName="bat" isInstalled actions={fixture_idleActions} size="xs" />,
};
export const Busy: Story = {
  render: () => <ToolActionButtons toolName="bat" isInstalled={false} actions={fixture_pendingActions} size="sm" />,
};

export default meta;
