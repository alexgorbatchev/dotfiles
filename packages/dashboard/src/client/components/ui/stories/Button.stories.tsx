import type { Meta, StoryObj } from "@storybook/preact";

import { Button } from "../Button";

const meta: Meta<typeof Button> = {
  title: "@dotfiles/dashboard/client/components/ui/Button",
  component: Button,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Button>Click me</Button>,
  play: async () => {},
};

export default meta;
export { Default as Button };
