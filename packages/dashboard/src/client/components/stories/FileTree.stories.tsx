import type { Meta, StoryObj } from "@storybook/preact";

import { FileTree } from "../FileTree";

const meta: Meta<typeof FileTree> = {
  title: "@dotfiles/dashboard/client/components/FileTree",
  component: FileTree,
};

type Story = StoryObj<typeof meta>;

const sampleNodes = [
  {
    name: "generated",
    path: "/generated",
    type: "directory" as const,
    children: [
      {
        name: "tool.sh",
        path: "/generated/tool.sh",
        type: "file" as const,
        fileType: "shim",
      },
    ],
  },
];

const Default: Story = {
  render: () => <FileTree nodes={sampleNodes} />,
  play: async () => {},
};

export default meta;
export { Default as FileTree };
