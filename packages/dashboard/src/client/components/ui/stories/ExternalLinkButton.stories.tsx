import type { Meta, StoryObj } from "@storybook/preact";

import { ExternalLinkButton } from "../ExternalLinkButton";

const meta: Meta<typeof ExternalLinkButton> = {
  title: "@dotfiles/dashboard/client/components/ui/ExternalLinkButton",
  component: ExternalLinkButton,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ExternalLinkButton href="https://example.com">Open docs</ExternalLinkButton>,
};

export default meta;
export { Default as ExternalLinkButton };
