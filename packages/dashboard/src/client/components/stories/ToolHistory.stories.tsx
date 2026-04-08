import type { Meta, StoryObj } from "@storybook/preact";

import { ToolHistory } from "../ToolHistory";

const meta: Meta<typeof ToolHistory> = {
  title: "dashboard/components/ToolHistory",
  component: ToolHistory,
};

type Story = StoryObj<typeof meta>;

const entries = [
  {
    id: 1,
    operationType: "writeFile",
    fileType: "config",
    filePath: "/dotfiles/.config/fzf/config",
    timestamp: "2026-01-01T00:00:00.000Z",
    relativeTime: "just now",
  },
];

const Default: Story = {
  render: () => (
    <ToolHistory entries={entries} installedAt="2026-01-01T00:00:00.000Z" dotfilesDir="/dotfiles" />
  ),
  play: async () => {},
};

export default meta;
export { Default as ToolHistory };
