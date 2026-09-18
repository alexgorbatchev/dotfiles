import type { Meta, StoryObj } from "@storybook/preact";

import { App } from "../App";

const meta: Meta<typeof App> = {
  title: "@dotfiles/dashboard/client/layouts/App",
  component: App,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <App />,
};

export default meta;
export { Default as App };
