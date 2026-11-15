import type { Meta, StoryObj } from "@storybook/preact";
import { LocationProvider } from "preact-iso";
import { useState } from "preact/hooks";
import { Button } from "../ui/Button";

import { CommandPalette } from "../CommandPalette";

const meta: Meta<typeof CommandPalette> = {
  title: "@dotfiles/dashboard/client/components/CommandPalette",
  component: CommandPalette,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

function SearchExample() {
  const [isOpen, setOpen] = useState(false);
  return (
    <LocationProvider>
      <Button onClick={() => setOpen(true)}>Search tools</Button>
      <CommandPalette isOpen={isOpen} onOpenChange={setOpen} />
    </LocationProvider>
  );
}

const Default: Story = { render: () => <SearchExample /> };

export default meta;
export { Default as CommandPalette };
