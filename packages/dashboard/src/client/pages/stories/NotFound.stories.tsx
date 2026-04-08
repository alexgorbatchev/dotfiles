import type { Meta, StoryObj } from "@storybook/preact";

import { NotFound } from "../NotFound";

const meta: Meta<typeof NotFound> = {
  title: "dashboard/pages/NotFound",
  component: NotFound,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <NotFound />,
  play: async () => {},
};

export { meta as default, Default as NotFound };
