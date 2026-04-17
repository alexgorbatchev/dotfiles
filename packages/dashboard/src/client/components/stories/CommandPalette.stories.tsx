import type { Meta, StoryObj } from "@storybook/preact";
import { LocationProvider } from "preact-iso";

import { CommandPalette } from "../CommandPalette";

const meta: Meta<typeof CommandPalette> = {
  title: "@dotfiles/dashboard/client/components/CommandPalette",
  component: CommandPalette,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <LocationProvider>
      <CommandPalette />
    </LocationProvider>
  ),
  play: async () => {},
};

export default meta;
export { Default as CommandPalette };
