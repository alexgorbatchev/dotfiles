import type { Meta, StoryObj } from "@storybook/preact";

import { ToolActionBanner } from "../ToolActionBanner";
import { fixture_failure, fixture_success, fixture_trustFailure } from "./fixtures";

const meta: Meta<typeof ToolActionBanner> = {
  title: "@dotfiles/dashboard/client/components/ToolActionBanner",
  component: ToolActionBanner,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

export const Success: Story = {
  render: () => <ToolActionBanner outcome={fixture_success} elapsedSeconds={12} onDismiss={() => {}} />,
};
export const Failure: Story = {
  render: () => <ToolActionBanner outcome={fixture_failure} onRetry={() => {}} onDismiss={() => {}} />,
};
export const TrustRequired: Story = {
  render: () => <ToolActionBanner outcome={fixture_trustFailure} onRetry={() => {}} onDismiss={() => {}} />,
};
export const RetryBlocked: Story = {
  render: () => <ToolActionBanner outcome={fixture_failure} onRetry={() => {}} isRetryDisabled />,
};

export default meta;
