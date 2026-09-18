import type { Meta, StoryObj } from "@storybook/preact";

import { InstallMethodBadge } from "../InstallMethodBadge";

const meta: Meta<typeof InstallMethodBadge> = {
  title: "@dotfiles/dashboard/client/components/InstallMethodBadge",
  component: InstallMethodBadge,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => <InstallMethodBadge method="github-release" ghCli={true} />,
};

export default meta;
export { Default as InstallMethodBadge };
