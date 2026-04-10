import type { Meta, StoryObj } from "@storybook/preact";

import { ToolSourceCard } from "../ToolSourceCard";

const meta: Meta<typeof ToolSourceCard> = {
  title: "client/components/ToolSourceCard",
  component: ToolSourceCard,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ToolSourceCard toolName="fzf" />,
  play: async () => {},
};

export default meta;
export { Default as ToolSourceCard };
