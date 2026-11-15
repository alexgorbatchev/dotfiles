import type { Meta, StoryObj } from "@storybook/preact";
import { ToolHealth } from "../ToolHealth";
import { fixture_health, fixture_tool } from "./fixtures";

const meta: Meta<typeof ToolHealth> = {
  title: "@dotfiles/dashboard/client/components/ToolHealth",
  component: ToolHealth,
  tags: ["!test"],
};
type Story = StoryObj<typeof meta>;
export default meta;

export const Unknown: Story = { render: () => <ToolHealth tool={fixture_tool} health={null} stale={false} /> };
export const RefreshFailed: Story = { render: () => <ToolHealth tool={fixture_tool} health={fixture_health} stale /> };
export const RecordedPathsPresent: Story = {
  render: () => <ToolHealth tool={fixture_tool} health={fixture_health} stale={false} />,
};
export const NoRecordedPaths: Story = {
  render: () => (
    <ToolHealth
      tool={{ ...fixture_tool, runtime: { ...fixture_tool.runtime, installPath: null, binaryPaths: [] } }}
      health={fixture_health}
      stale={false}
    />
  ),
};
export const MissingPlugin: Story = {
  render: () => (
    <ToolHealth
      tool={fixture_tool}
      health={{
        ...fixture_health,
        overall: "warning",
        checks: [
          {
            id: "registry-integrity",
            name: "Registry Integrity",
            status: "warn",
            message: "An installation is missing",
            findings: [
              {
                kind: "missing-installation",
                toolName: fixture_tool.config.name,
                path: "/plugins/example",
                severity: "warning",
                configured: true,
              },
            ],
          },
        ],
      }}
      stale={false}
    />
  ),
};
