import type { Meta, StoryObj } from "@storybook/preact";

import { ExternalLinkButton } from "../ExternalLinkButton";

const meta: Meta<typeof ExternalLinkButton> = {
  title: "dashboard/components/ui/ExternalLinkButton",
  component: ExternalLinkButton,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <ExternalLinkButton href="https://example.com">Open docs</ExternalLinkButton>,
  play: async () => {},
};

export default meta;
export { Default as ExternalLinkButton };
