import type { IConfigSummary, IToolDetail, IToolHistory } from "../../shared/types";
import type { IToolActionResult, IUseToolActions } from "../hooks/useToolActions";

export const fixture_idleActions: IUseToolActions = {
  pending: null,
  results: [],
  dismissResult: () => {},
  retryResult: async () => {},
  installTool: async () => {},
  updateTool: async () => {},
  checkTool: async () => {},
};

export const fixture_failedResult: IToolActionResult = {
  id: 1,
  request: { toolName: "bat", kind: "install", force: true },
  outcome: { toolName: "bat", kind: "install", message: "Network unavailable", tone: "error" },
  elapsedSeconds: 2,
};

export const fixture_projectConfig: IConfigSummary = {
  dotfilesDir: "/project",
  generatedDir: "/project/.generated",
  binariesDir: "/project/bin",
  targetDir: "/home/test",
  toolConfigsDir: "/project/tools",
};

export const fixture_tool: IToolDetail = {
  config: { name: "example", version: "1", installationMethod: "manual", binaries: ["example"] },
  runtime: {
    status: "installed",
    installedVersion: "1",
    installedAt: "2026-11-15T06:00:00Z",
    installPath: "/bin/example",
    binaryPaths: ["/bin/example"],
  },
  files: [],
  binaryDiskSize: 0,
  usage: { totalCount: 0, binaries: [] },
};

export const fixture_emptyHistory: IToolHistory = {
  entries: [],
  totalCount: 0,
  installedAt: null,
  dotfilesDir: "/project",
};

export const fixture_configurationTool: IToolDetail = {
  ...fixture_tool,
  config: { name: "configuration-only" },
  runtime: { ...fixture_tool.runtime, binaryPaths: null },
};
