import type { Meta, StoryObj } from "@storybook/preact";

import { InstallMethodBadge } from "../InstallMethodBadge";

const meta: Meta<typeof InstallMethodBadge> = {
  title: "client/components/InstallMethodBadge",
  component: InstallMethodBadge,
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <InstallMethodBadge method="github-release" ghCli={true} />,
  play: async () => {},
};

export default meta;
export { Default as InstallMethodBadge };
