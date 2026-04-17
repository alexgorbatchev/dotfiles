import type { Meta, StoryObj } from "@storybook/preact";

import type { ITreeItemData } from "../Tree";
import { Tree } from "../Tree";

const meta: Meta<typeof Tree> = {
  title: "@dotfiles/dashboard/client/components/ui/Tree",
  component: Tree,
};

type Story = StoryObj<typeof meta>;

const items: ITreeItemData[] = [
  {
    id: "folder",
    label: "Folder",
    children: [{ id: "file", label: "File" }],
  },
];

const Default: Story = {
  render: () => <Tree items={items} />,
  play: async () => {},
};

export default meta;
export { Default as Tree };
