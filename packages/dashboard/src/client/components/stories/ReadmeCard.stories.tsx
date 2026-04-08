import type { Meta, StoryObj } from "@storybook/preact";

import { ReadmeCard } from "../ReadmeCard";

const meta: Meta<typeof ReadmeCard> = {
  title: "dashboard/components/ReadmeCard",
  component: ReadmeCard,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ReadmeCard toolName="fzf" repo="junegunn/fzf" />,
  play: async () => {},
};

export default meta;
export { Default as ReadmeCard };
