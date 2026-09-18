import type { Meta, StoryObj } from "@storybook/preact";

import { Info } from "../../../icons";
import { TitledCard } from "../TitledCard";

const meta: Meta<typeof TitledCard> = {
  title: "@dotfiles/dashboard/client/components/ui/TitledCard",
  component: TitledCard,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <TitledCard title="Overview" icon={<Info class="h-4 w-4" />}>
      Story content
    </TitledCard>
  ),
};

export default meta;
export { Default as TitledCard };
