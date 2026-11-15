import type { Meta, StoryObj } from "@storybook/preact";
import { RequestStateNotice } from "../RequestStateNotice";

const meta: Meta<typeof RequestStateNotice> = {
  title: "@dotfiles/dashboard/client/components/RequestStateNotice",
  component: RequestStateNotice,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <RequestStateNotice label="Tools" loading error={null} hasData={false} onRetry={() => {}} />,
};
export const Failed: Story = {
  render: () => (
    <RequestStateNotice
      label="Tools"
      loading={false}
      error={new Error("The server is unavailable.")}
      hasData={false}
      onRetry={() => {}}
    />
  ),
};
export const Stale: Story = {
  render: () => (
    <RequestStateNotice label="Tools" loading={false} error={new Error("Refresh failed.")} hasData onRetry={() => {}} />
  ),
};

export default meta;
