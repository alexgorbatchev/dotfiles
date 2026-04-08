import type { Meta, StoryObj } from "@storybook/preact";
import { LocationProvider } from "preact-iso";

import { Nav } from "../Nav";

const meta: Meta<typeof Nav> = {
  title: "dashboard/components/Nav",
  component: Nav,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <LocationProvider>
      <Nav />
    </LocationProvider>
  ),
  play: async () => {},
};

export default meta;
export { Default as Nav };
