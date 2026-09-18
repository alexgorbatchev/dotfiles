import type { Meta, StoryObj } from "@storybook/preact";

import { Badge } from "../Badge";

const meta: Meta<typeof Badge> = {
  title: "@dotfiles/dashboard/client/components/ui/Badge",
  component: Badge,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Badge variant="outline">Preview</Badge>,
};

export default meta;
export { Default as Badge };
