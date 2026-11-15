import type { Meta, StoryObj } from "@storybook/preact";
import { FirstToolSetup } from "../FirstToolSetup";

const meta: Meta<typeof FirstToolSetup> = {
  title: "@dotfiles/dashboard/client/components/FirstToolSetup",
  component: FirstToolSetup,
  tags: ["!test"],
};
type Story = StoryObj<typeof meta>;
const Default: Story = { render: () => <FirstToolSetup onRecheck={() => {}} /> };
export default meta;
export { Default as FirstToolSetup };
