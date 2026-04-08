import type { Meta, StoryObj } from "@storybook/preact";

import { Info } from "../../../icons";
import { TitledCard } from "../TitledCard";

const meta: Meta<typeof TitledCard> = {
  title: "dashboard/components/ui/TitledCard",
  component: TitledCard,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <TitledCard title="Overview" icon={<Info class="h-4 w-4" />}>
      Story content
    </TitledCard>
  ),
  play: async () => {},
};

export { meta as default, Default as TitledCard };
