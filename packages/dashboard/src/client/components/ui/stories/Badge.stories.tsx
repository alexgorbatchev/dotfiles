import type { Meta, StoryObj } from "@storybook/preact";

import { Badge } from "../Badge";

const meta: Meta<typeof Badge> = {
  title: "dashboard/components/ui/Badge",
  component: Badge,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Badge variant="outline">Preview</Badge>,
  play: async () => {},
};

export { meta as default, Default as Badge };
