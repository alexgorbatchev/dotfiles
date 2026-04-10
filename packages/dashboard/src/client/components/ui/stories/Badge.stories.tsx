import type { Meta, StoryObj } from "@storybook/preact";

import { Badge } from "../Badge";

const meta: Meta<typeof Badge> = {
  title: "client/components/ui/Badge",
  component: Badge,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Badge variant="outline">Preview</Badge>,
  play: async () => {},
};

export default meta;
export { Default as Badge };
