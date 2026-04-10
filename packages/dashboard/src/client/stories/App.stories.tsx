import type { Meta, StoryObj } from "@storybook/preact";

import { App } from "../App";

const meta: Meta<typeof App> = {
  title: "client/App",
  component: App,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <App />,
  play: async () => {},
};

export default meta;
export { Default as App };
