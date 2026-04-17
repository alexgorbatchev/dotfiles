import type { Meta, StoryObj } from "@storybook/preact";

import { Card, CardContent, CardHeader, CardTitle } from "../Card";

const meta: Meta<typeof Card> = {
  title: "@dotfiles/dashboard/client/components/ui/Card",
  component: Card,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Card title</CardTitle>
      </CardHeader>
      <CardContent>Card content</CardContent>
    </Card>
  ),
  play: async () => {},
};

export default meta;
export { Default as Card };
