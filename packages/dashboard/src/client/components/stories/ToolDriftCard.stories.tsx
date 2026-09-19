import type { Meta, StoryObj } from "@storybook/preact";

import { ToolDriftCard } from "../ToolDriftCard";

import type { IDriftItem } from "../../../shared/types";

const meta: Meta<typeof ToolDriftCard> = {
  title: "@dotfiles/dashboard/client/components/ToolDriftCard",
  component: ToolDriftCard,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const driftItems: IDriftItem[] = [
  {
    toolName: "ssh",
    filePath: "~/.ssh/config",
    blockId: "includes",
    type: "block",
    state: "in-sync",
  },
  {
    toolName: "git",
    filePath: "~/.gitconfig",
    type: "template",
    state: "local-drift",
    diff: "--- ~/.gitconfig (current)\n+++ ~/.gitconfig (desired)\n-email = custom@example.com\n+email = alex@example.com\n",
  },
];

const Default: Story = {
  render: () => <ToolDriftCard driftItems={driftItems} />,
};

export default meta;
export { Default as ToolDriftCard };
