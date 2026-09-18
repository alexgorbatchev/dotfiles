import type { Meta, StoryObj } from "@storybook/preact";

import { ReadmeCard } from "../ReadmeCard";

const meta: Meta<typeof ReadmeCard> = {
  title: "@dotfiles/dashboard/client/components/ReadmeCard",
  component: ReadmeCard,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ReadmeCard toolName="fzf" repo="junegunn/fzf" />,
};

export default meta;
export { Default as ReadmeCard };
