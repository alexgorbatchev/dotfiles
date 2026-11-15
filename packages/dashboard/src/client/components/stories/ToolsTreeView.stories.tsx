import type { Meta, StoryObj } from "@storybook/preact";

import type { IToolDetail } from "../../../shared/types";
import { useInventoryQuery } from "../../hooks/useInventoryQuery";
import type { IUseToolActions } from "../../hooks/useToolActions";
import { ToolsTreeView } from "../ToolsTreeView";

const meta: Meta<typeof ToolsTreeView> = {
  title: "@dotfiles/dashboard/client/components/ToolsTreeView",
  component: ToolsTreeView,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const noopActions: IUseToolActions = {
  pending: null,
  results: [],
  dismissResult: () => {},
  retryResult: async () => {},
  installTool: async () => {},
  updateTool: async () => {},
  checkTool: async () => {},
};

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
  render: () => {
    const inventory = useInventoryQuery();
    return <ToolsTreeView tools={tools} actions={noopActions} inventory={inventory} />;
  },
};

export default meta;
export { Default as ToolsTreeView };
