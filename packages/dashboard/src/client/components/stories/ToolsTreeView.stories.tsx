import type { Meta, StoryObj } from "@storybook/preact";

import type { IToolDetail } from "../../../shared/types";
import { ToolsTreeView } from "../ToolsTreeView";

const meta: Meta<typeof ToolsTreeView> = {
  title: "dashboard/components/ToolsTreeView",
  component: ToolsTreeView,
};

type Story = StoryObj<typeof meta>;

const tools: IToolDetail[] = [
  {
    config: {
      name: "fzf",
      version: "0.55.0",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    },
    runtime: {
      status: "installed",
      installedVersion: "0.55.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      installPath: "/tools/fzf",
      binaryPaths: ["/tools/fzf/bin/fzf"],
      hasUpdate: false,
    },
    files: [],
    binaryDiskSize: 1024,
    usage: {
      totalCount: 12,
      binaries: [{ binaryName: "fzf", count: 12, lastUsedAt: "2026-01-01T00:00:00.000Z" }],
    },
  },
];

const Default: Story = {
  render: () => <ToolsTreeView tools={tools} />,
  play: async () => {},
};

export { meta as default, Default as ToolsTreeView };
