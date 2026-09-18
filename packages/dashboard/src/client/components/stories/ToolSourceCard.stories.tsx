import type { Meta, StoryObj } from "@storybook/preact";

import { ToolSourceCard } from "../ToolSourceCard";

const meta: Meta<typeof ToolSourceCard> = {
  title: "@dotfiles/dashboard/client/components/ToolSourceCard",
  component: ToolSourceCard,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ToolSourceCard toolName="fzf" />,
};

export default meta;
export { Default as ToolSourceCard };
