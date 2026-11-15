import type { Meta, StoryObj } from "@storybook/preact";

import { OperationStatus } from "../OperationStatus";
import { fixture_failure, fixture_idleActions, fixture_pendingActions, fixture_result } from "./fixtures";

const meta: Meta<typeof OperationStatus> = {
  title: "@dotfiles/dashboard/client/components/OperationStatus",
  component: OperationStatus,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

export const Idle: Story = { render: () => <OperationStatus actions={fixture_idleActions} /> };
export const Pending: Story = { render: () => <OperationStatus actions={fixture_pendingActions} /> };
export const Completed: Story = {
  render: () => <OperationStatus actions={{ ...fixture_idleActions, results: [fixture_result] }} />,
};
export const Failed: Story = {
  render: () => (
    <OperationStatus actions={{ ...fixture_idleActions, results: [{ ...fixture_result, outcome: fixture_failure }] }} />
  ),
};
export const PreviousResultWhilePending: Story = {
  render: () => <OperationStatus actions={{ ...fixture_pendingActions, results: [fixture_result] }} />,
};

export default meta;
