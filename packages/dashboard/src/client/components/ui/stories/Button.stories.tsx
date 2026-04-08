import type { Meta, StoryObj } from "@storybook/preact";

import { Button } from "../Button";

const meta: Meta<typeof Button> = {
  title: "dashboard/components/ui/Button",
  component: Button,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <Button>Click me</Button>,
  play: async () => {},
};

export { meta as default, Default as Button };
