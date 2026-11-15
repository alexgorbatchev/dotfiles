import type { Meta, StoryObj } from "@storybook/preact";
import { CopyButton } from "../CopyButton";

const meta: Meta<typeof CopyButton> = {
  title: "@dotfiles/dashboard/client/components/CopyButton",
  component: CopyButton,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  args: { text: "/home/alex/.config/example/settings.toml", label: "Copy path" },
};

export default meta;
export { Default as CopyButton };
