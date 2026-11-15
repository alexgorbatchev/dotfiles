import type { Meta, StoryObj } from "@storybook/preact";

import { ToolDriftCard } from "../ToolDriftCard";

import { fixture_driftItems } from "./fixtures";

const meta: Meta<typeof ToolDriftCard> = {
  title: "@dotfiles/dashboard/client/components/ToolDriftCard",
  component: ToolDriftCard,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ToolDriftCard driftItems={fixture_driftItems} />,
};

export default meta;
export { Default as ToolDriftCard };
